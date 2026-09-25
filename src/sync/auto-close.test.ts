import { describe, expect, it } from 'vitest';
import { CLOSE_GRACE_MS, shouldAutoClose } from './game';
import type { Clock } from './schema';

const clock: Clock = {
  month: 2, monthKey: 'm02', phase: 'input', deadlineAt: 100_000, quarterStart: false,
  prices: { lemon: 80, sugar: 10, barista: 2000 },
};

describe('shouldAutoClose（自動の締切）', () => {
  it('締切を過ぎても、猶予の間は締め切らない（ぎりぎりの提出を取りこぼさない）', () => {
    expect(shouldAutoClose(clock, 100_000, ['t01'], [], true)).toBe(false);
    expect(shouldAutoClose(clock, 100_000 + CLOSE_GRACE_MS - 1, ['t01'], [], true)).toBe(false);
    expect(shouldAutoClose(clock, 100_000 + CLOSE_GRACE_MS, ['t01'], [], true)).toBe(true);
  });

  it('参加しているチームが全員提出したら、早めに締め切る', () => {
    expect(shouldAutoClose(clock, 50_000, ['t01', 't02'], ['t01'], true)).toBe(false);
    expect(shouldAutoClose(clock, 50_000, ['t01', 't02'], ['t02', 't01'], true)).toBe(true);
  });

  it('早めに締め切る設定がオフなら、締切まで待つ', () => {
    expect(shouldAutoClose(clock, 50_000, ['t01'], ['t01'], false)).toBe(false);
  });

  it('参加チームがいなければ、早めには締め切らない', () => {
    expect(shouldAutoClose(clock, 50_000, [], [], true)).toBe(false);
  });

  it('入力中でなければ締め切らない', () => {
    expect(shouldAutoClose({ ...clock, phase: 'result' }, 999_999, ['t01'], ['t01'], true)).toBe(false);
  });
});
