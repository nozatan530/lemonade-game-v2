// sync の関数で、作成 → 参加 → 提出 → 締切 → 翌月 → 期末 を通して動かす（エミュレーターで実行）

import { createUserWithEmailAndPassword, signInAnonymously } from 'firebase/auth';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER, defaultConfig } from '../../engine/config';
import { allowGmInEmulator, connectFirebase, type FirebaseHandles } from '../firebase';
import {
  claimTeam, closeCurrentMonth, createGame, deleteGame, extendDeadline, readPath, readResults, restartGame, endGameEarly, setMonthPrices, startGame,
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
  await allowGmInEmulator(cred.user.uid);
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

  it('開始時に参加していないチームを外すと、市場予算の基準もチーム数に合わせて変わる', async () => {
    const gm = await newGm();
    const code = await createGame(gm.db, gm.uid, {
      config: defaultConfig(3, 'drop'), teamNames: ['A', 'B', 'C'], timer: DEFAULT_TIMER, now: Date.now(),
    });
    const a = await newTeamDevice();
    const b = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    await claimTeam(b.db, code, 't02', b.uid);
    await startGame(gm.db, code, Date.now(), { dropUnjoined: true });

    const teams = await readPath<Record<string, unknown>>(gm.db, `games/${code}/teams`);
    expect(Object.keys(teams!)).toEqual(['t01', 't02']);
    const config = await readPath<{ market: { base: number } }>(gm.db, `games/${code}/config`);
    expect(config!.market.base).toBe(40000);
    const state = await readPath<Record<string, unknown>>(gm.db, `games/${code}/state`);
    expect(Object.keys(state!)).toEqual(['t01', 't02']);

    await submitDecision(a.db, code, 1, 't01', { lemonQty: 10, sugarQty: 10, price: 100 });
    await closeCurrentMonth(gm.db, code);
    const [r] = await readResults(gm.db, code);
    expect(r!.teamResults.map((t) => t.teamId)).toEqual(['t01', 't02']);
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

  it('2年：12か月目の結果のあとに年の決算をはさみ、13か月目へ進む。お金は引き継ぐ', async () => {
    const gm = await newGm();
    const config = { ...defaultConfig(2, 'years'), months: 24 };
    const code = await createGame(gm.db, gm.uid, { config, teamNames: ['A', 'B'], timer: DEFAULT_TIMER, now: Date.now() });
    const a = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    await startGame(gm.db, code, Date.now());
    for (let month = 1; month <= 12; month++) {
      const c = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
      await submitDecision(a.db, code, month, 't01', { lemonQty: 20, sugarQty: 20, price: 150 }, c.quarterStart ? { baristaCount: 1 } : undefined);
      await closeCurrentMonth(gm.db, code);
      const next = await startNextMonth(gm.db, code, Date.now());
      expect(next).toBe(month === 12 ? 'yearEnd' : 'started');
    }
    const atYearEnd = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
    expect(atYearEnd.phase).toBe('yearEnd');
    expect(atYearEnd.month).toBe(12);
    const balance12 = (await readPath<{ balance: number }>(a.db, `games/${code}/state/t01`))!.balance;

    expect(await startNextMonth(gm.db, code, Date.now())).toBe('started');
    const clock13 = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
    expect(clock13.month).toBe(13);
    expect(clock13.phase).toBe('input');
    // 13か月目にも提出でき、お金は12か月目の終わりから続く
    await submitDecision(a.db, code, 13, 't01', { lemonQty: 0, sugarQty: 0, price: 0, watching: true });
    await closeCurrentMonth(gm.db, code);
    const [r13] = (await readResults(a.db, code)).filter((r) => r.month === 13);
    const t01 = r13!.teamResults.find((t) => t.teamId === 't01')!;
    expect(t01.balance).toBe(balance12 - t01.totalCost);
  });

  it('GM は入力中の月の単価を変えられ、その月はその単価で集計する。チームは変えられない', async () => {
    const gm = await newGm();
    const code = await createGame(gm.db, gm.uid, {
      config: defaultConfig(2, 'price'), teamNames: ['A', 'B'], timer: DEFAULT_TIMER, now: Date.now(),
    });
    const a = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    await startGame(gm.db, code, Date.now());
    const prices = { lemon: 123, sugar: 45, barista: 2500 };
    await expect(setMonthPrices(a.db, code, prices)).rejects.toThrow();
    await expect(setMonthPrices(gm.db, code, { ...prices, lemon: 0 })).rejects.toThrow();
    expect(await setMonthPrices(gm.db, code, prices)).toBe('ok');
    expect((await readPath<Clock>(a.db, `games/${code}/clock`))!.prices).toEqual(prices);
    // GM は提出の中身を読める（チームはほかのチームの提出を読めない）
    await submitDecision(a.db, code, 1, 't01', { lemonQty: 10, sugarQty: 10, price: 200 });
    expect((await readPath<{ monthlyDecision: { price: number } }>(gm.db, `games/${code}/subs/m01/t01`))!.monthlyDecision.price).toBe(200);
    await closeCurrentMonth(gm.db, code);
    const [r1] = await readResults(a.db, code);
    expect(r1!.prices).toEqual(prices);
    const t01 = r1!.teamResults.find((t) => t.teamId === 't01')!;
    expect(t01.costLemon).toBe(10 * 123);
    // 結果のあとは変えられない
    expect(await setMonthPrices(gm.db, code, prices)).toBe('noop');
  });

  it('GM は途中で終えられる。結果が出た月までで期末になり、チームは終えられない', async () => {
    const gm = await newGm();
    const code = await createGame(gm.db, gm.uid, {
      config: defaultConfig(2, 'early'), teamNames: ['A', 'B'], timer: DEFAULT_TIMER, now: Date.now(),
    });
    const a = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    await startGame(gm.db, code, Date.now());
    await submitDecision(a.db, code, 1, 't01', { lemonQty: 10, sugarQty: 10, price: 100 });
    await closeCurrentMonth(gm.db, code);
    expect(await startNextMonth(gm.db, code, Date.now())).toBe('started');
    // 2か月目の入力中に終える
    await expect(endGameEarly(a.db, code)).rejects.toThrow();
    expect(await endGameEarly(gm.db, code)).toBe('final');
    const clock = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
    expect(clock.phase).toBe('final');
    expect(clock.endedEarly).toBe(true);
    expect(await readResults(a.db, code)).toHaveLength(1);
    // もう終わっているので何もしない
    expect(await endGameEarly(gm.db, code)).toBe('noop');
    // 次のゲームを始めると、途中で終えた印は消える
    await restartGame(gm.db, code, Date.now());
    expect((await readPath<Clock>(a.db, `games/${code}/clock`))!.endedEarly).toBeUndefined();
  });

  it('期末のあと、同じコード・同じチームで次のゲームを始められる。チームは書きかえられない', async () => {
    const gm = await newGm();
    const code = await createGame(gm.db, gm.uid, {
      config: { ...defaultConfig(2, 'again'), months: 1 }, teamNames: ['A', 'B'], timer: DEFAULT_TIMER, now: Date.now(),
    });
    const a = await newTeamDevice();
    await claimTeam(a.db, code, 't01', a.uid);
    await startGame(gm.db, code, Date.now());
    await submitDecision(a.db, code, 1, 't01', { lemonQty: 10, sugarQty: 10, price: 100 });
    await closeCurrentMonth(gm.db, code);
    expect(await startNextMonth(gm.db, code, Date.now())).toBe('final');

    // チームは結果や提出を消せない
    await expect(restartGame(a.db, code, Date.now())).rejects.toThrow();

    await restartGame(gm.db, code, Date.now());
    const clock = (await readPath<Clock>(a.db, `games/${code}/clock`))!;
    expect(clock.phase).toBe('lobby');
    expect(await readResults(a.db, code)).toHaveLength(0);
    // 参加したまま
    expect((await readPath<{ uid: string }>(a.db, `games/${code}/teams/t01`))!.uid).toBe(a.uid);
    await startGame(gm.db, code, Date.now());
    await submitDecision(a.db, code, 1, 't01', { lemonQty: 5, sugarQty: 5, price: 100 });
    expect(await closeCurrentMonth(gm.db, code)).toBe('closed');
  });
});
