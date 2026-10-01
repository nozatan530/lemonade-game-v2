// ルームモードの流れとセキュリティルール（エミュレーターで実行）

import { signInAnonymously } from 'firebase/auth';
import { get, ref, set } from 'firebase/database';
import { describe, expect, it } from 'vitest';
import { connectFirebase } from '../firebase';
import {
  advanceRoom, closeRoomMonth, createRoom, endRoom, goOnline, takeOverSeat, joinRoom, readyNext, roomPath, shouldAdvanceRoom, shouldCloseRoom, startRoom,
  submitRoom, type RoomClock, type RoomSeat,
} from '../room';

let appCount = 0;
async function newDevice() {
  const h = connectFirebase({ useEmulator: true, appName: `room${++appCount}-${Date.now()}` });
  const cred = await signInAnonymously(h.auth);
  return { ...h, uid: cred.user.uid };
}
const read = async <T>(db: ReturnType<typeof connectFirebase>['db'], path: string) =>
  (await get(ref(db, path))).val() as T;

describe('ルームモード', () => {
  it('作る → 2人で参加 → はじめる（空いた2席はロボット）→ 提出 → 集計 → 次の月', async () => {
    const owner = await newDevice();
    const guest = await newDevice();
    const code = await createRoom(owner.db, owner.uid, { difficulty: 'normal', pattern: 'stable', now: Date.now() });
    expect(await joinRoom(guest.db, code, guest.uid)).toBe('t02');
    // 同じ人がもう一度入っても同じ席
    expect(await joinRoom(guest.db, code, guest.uid)).toBe('t02');

    await startRoom(guest.db, code, Date.now());
    const seats = await read<Record<string, RoomSeat>>(owner.db, roomPath(code, 'seats'));
    expect(seats.t01!.uid).toBe(owner.uid);
    expect(seats.t03!.robot).toBeTruthy();
    expect(seats.t04!.robot).toBeTruthy();

    // 入力中は、ほかの人の決定は読めない
    await submitRoom(owner.db, code, 1, 't01', { lemonQty: 30, sugarQty: 30, price: 200 }, { baristaCount: 1 });
    await expect(get(ref(guest.db, roomPath(code, 'subs/m01/t01')))).rejects.toThrow();
    await submitRoom(guest.db, code, 1, 't02', { lemonQty: 30, sugarQty: 30, price: 250 }, { baristaCount: 1 });

    const clock = await read<RoomClock>(owner.db, roomPath(code, 'clock'));
    const submitted = await read<Record<string, number>>(owner.db, roomPath(code, 'submitted/m01'));
    // 全員が出しても、5秒たつまでは集計しない
    const last = Math.max(...Object.values(submitted));
    expect(shouldCloseRoom(clock, last + 1000, ['t01', 't02'], submitted)).toBe(false);
    expect(shouldCloseRoom(clock, last + 2500, ['t01', 't02'], submitted)).toBe(true);

    // 2台が同時に集計しても、結果は1つ
    const [a, b] = await Promise.all([closeRoomMonth(owner.db, code, Date.now()), closeRoomMonth(guest.db, code, Date.now())]);
    expect([a, b].filter((x) => x === 'closed')).toHaveLength(1);
    const r1 = await read<{ teamResults: { teamId: string }[] }>(guest.db, roomPath(code, 'results/m01'));
    expect(r1.teamResults.map((t) => t.teamId).sort()).toEqual(['t01', 't02', 't03', 't04']);

    // 結果のあと：全員が「次の月へ」を押したら進む
    const after = await read<RoomClock>(owner.db, roomPath(code, 'clock'));
    expect(after.phase).toBe('result');
    await readyNext(owner.db, code, 1, 't01');
    await readyNext(guest.db, code, 1, 't02');
    const ready = await read<Record<string, number>>(owner.db, roomPath(code, 'ready/m01'));
    const lastReady = Math.max(ready.t01!, ready.t02!);
    // 最後の人が押してすぐは進まない（だれが最後か分かりにくくする）
    expect(shouldAdvanceRoom(after, lastReady + 1000, ['t01', 't02'], ready)).toBe(false);
    expect(shouldAdvanceRoom(after, lastReady + 2500, ['t01', 't02'], ready)).toBe(true);
    await Promise.all([advanceRoom(owner.db, code, Date.now()), advanceRoom(guest.db, code, Date.now())]);
    const m2 = await read<RoomClock>(owner.db, roomPath(code, 'clock'));
    expect(m2.month).toBe(2);
    expect(m2.phase).toBe('input');
  });

  it('5人目は入れない。ロボットの席や、ほかの人の席は取れない', async () => {
    const owner = await newDevice();
    const code = await createRoom(owner.db, owner.uid, { difficulty: 'easy', pattern: 'stable', now: Date.now() });
    const others = await Promise.all([newDevice(), newDevice(), newDevice()]);
    for (const d of others) await joinRoom(d.db, code, d.uid);
    const fifth = await newDevice();
    await expect(joinRoom(fifth.db, code, fifth.uid)).rejects.toThrow();
    // 座っている席の uid は書きかえられない
    await expect(set(ref(fifth.db, roomPath(code, 'seats/t02/uid')), fifth.uid)).rejects.toThrow();
  });

  it('1人が同時に開けるルームは1つ。参加していない人は進行を書きかえられない', async () => {
    const owner = await newDevice();
    const code = await createRoom(owner.db, owner.uid, { difficulty: 'normal', pattern: 'stable', now: Date.now() });
    await expect(createRoom(owner.db, owner.uid, { difficulty: 'normal', pattern: 'stable', now: Date.now() })).rejects.toThrow();
    const stranger = await newDevice();
    await expect(set(ref(stranger.db, roomPath(code, 'clock/phase')), 'final')).rejects.toThrow();
    await expect(set(ref(stranger.db, roomPath(code, 'state')), {})).rejects.toThrow();
  });

  it('抜けた人の席：つながっている間は取れず、切れたら入り直せる。出さなかった月はロボットがおまかせで決める', async () => {
    const owner = await newDevice();
    const guest = await newDevice();
    const code = await createRoom(owner.db, owner.uid, { difficulty: 'normal', pattern: 'stable', now: Date.now() });
    await joinRoom(guest.db, code, guest.uid);
    await goOnline(owner.db, code, 't01');
    await goOnline(guest.db, code, 't02');
    await startRoom(owner.db, code, Date.now());

    const newcomer = await newDevice();
    // まだつながっている人の席は取れない
    await expect(takeOverSeat(newcomer.db, code, newcomer.uid, 't02')).rejects.toThrow();

    // guest の接続が切れた（onDisconnect で false になったのと同じ）
    await set(ref(guest.db, roomPath(code, 'seats/t02/online')), false);
    // owner だけ出して締める → t02 はロボットがおまかせ
    await submitRoom(owner.db, code, 1, 't01', { lemonQty: 30, sugarQty: 30, price: 200 }, { baristaCount: 1 });
    expect(await closeRoomMonth(owner.db, code, Date.now())).toBe('closed');
    const auto = await read<Record<string, true>>(owner.db, roomPath(code, 'auto/m01'));
    expect(auto).toEqual({ t02: true });
    const r1 = await read<{ teamResults: { teamId: string; offered: number; lemonBought: number }[] }>(owner.db, roomPath(code, 'results/m01'));
    const t02 = r1.teamResults.find((t) => t.teamId === 't02')!;
    expect(t02.lemonBought).toBeGreaterThan(0); // 静観ではない

    // 新しい端末が、その席で入り直せる
    await takeOverSeat(newcomer.db, code, newcomer.uid, 't02');
    const seat = await read<RoomSeat>(owner.db, roomPath(code, 'seats/t02'));
    expect(seat.uid).toBe(newcomer.uid);
    expect(seat.online).toBe(true);
  });

  it('ゲームを途中で終われる。参加していない人は終われない', async () => {
    const owner = await newDevice();
    const code = await createRoom(owner.db, owner.uid, { difficulty: 'easy', pattern: 'stable', now: Date.now() });
    await startRoom(owner.db, code, Date.now());
    const stranger = await newDevice();
    await expect(endRoom(stranger.db, code, 'x')).rejects.toThrow();
    expect(await endRoom(owner.db, code, '🐊 Alligator')).toBe('final');
    const clock = await read<RoomClock>(owner.db, roomPath(code, 'clock'));
    expect(clock.phase).toBe('final');
    expect(clock.endedEarlyBy).toBe('🐊 Alligator');
  });
});
