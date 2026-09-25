// sync の関数で、作成 → 参加 → 提出 → 締切 → 翌月 → 期末 を通して動かす（エミュレーターで実行）

import { createUserWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER, defaultConfig } from '../../engine/config';
import { connectFirebase, type FirebaseHandles } from '../firebase';
import {
  claimTeam, closeCurrentMonth, createGame, deleteGame, extendDeadline, readPath, readResults, startGame,
  startNextMonth, submitDecision,
} from '../game';
import type { Clock } from '../schema';

let appCount = 0;
function newUser(): FirebaseHandles {
  return connectFirebase({ useEmulator: true, appName: `user${++appCount}-${Date.now()}` });
}

async function newGm() {
  const h = newUser();
  const cred = await createUserWithEmailAndPassword(h.auth, `gm${appCount}-${Date.now()}@example.com`, 'password123');
  return { ...h, uid: cred.user.uid };
}

async function newTeamDevice() {
  const h = newUser();
  const cred = await signInAnonymously(h.auth);
  return { ...h, uid: cred.user.uid };
}

describe('ゲームの流れ（sync）', () => {
  it('3チームで12か月を回し、期末になる', async () => {
    const gm = await newGm();
    const config = defaultConfig(3, 'flow-test');
    const code = await createGame(gm.db, gm.uid, {
      config, teamNames: ['A', 'B', 'C'], timer: DEFAULT_TIMER, now: Date.now(),
    });
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    // A と B は参加。C は参加しない（毎月未提出 → 静観 → 以後も同じ）
    const a = await newTeamDevice();
    const b = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    await claimTeam(b.db, code, 't02', b.uid);
    // 使われている枠は取れない
    await expect(claimTeam(b.db, code, 't01', b.uid)).rejects.toThrow();

    await startGame(gm.db, code, Date.now());

    for (let month = 1; month <= 12; month++) {
      const clock = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
      expect(clock.month).toBe(month);
      expect(clock.phase).toBe('input');

      const quarterly = clock.quarterStart ? { baristaCount: 1 } : undefined;
      await submitDecision(a.db, code, month, 't01', { lemonQty: 40, sugarQty: 40, price: 150 }, quarterly);
      // B は2か月目以降は提出しない（前月と同じ決定で補われる）
      if (month === 1) await submitDecision(b.db, code, month, 't02', { lemonQty: 30, sugarQty: 30, price: 120, maxSell: 30 });

      expect(await closeCurrentMonth(gm.db, code)).toBe('closed');
      // 2回締め切っても結果は変わらない
      expect(await closeCurrentMonth(gm.db, code)).toBe('already');

      const next = await startNextMonth(gm.db, code, Date.now());
      expect(next).toBe(month === 12 ? 'final' : 'started');
    }

    const results = await readResults(a.db, code);
    expect(results).toHaveLength(12);
    for (const r of results) {
      const [ra, rb, rc] = r.teamResults;
      expect(ra!.offered).toBe(40);
      expect(rb!.offered).toBe(30); // 前月と同じ決定（販売上限30杯）が続く
      expect(rc!.offered).toBe(0); // 静観
      expect(rc!.costBarista).toBe(2000); // 静観でも給与はかかる
    }
    const clock = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
    expect(clock.phase).toBe('final');

    await deleteGame(gm.db, code, gm.uid);
    expect(await readPath(gm.db, `games/${code}/meta`)).toBeNull();
  });

  it('締切の延長ができ、締切後は提出できない', async () => {
    const gm = await newGm();
    const code = await createGame(gm.db, gm.uid, {
      config: defaultConfig(2, 's'), teamNames: ['A', 'B'], timer: DEFAULT_TIMER, now: Date.now(),
    });
    const a = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    // 締切を過去にして始める
    await startGame(gm.db, code, Date.now() - 200_000);
    await expect(submitDecision(a.db, code, 1, 't01', { lemonQty: 1, sugarQty: 1, price: 100 })).rejects.toThrow();
    await extendDeadline(gm.db, code, 300);
    await submitDecision(a.db, code, 1, 't01', { lemonQty: 1, sugarQty: 1, price: 100 });
  });
});
