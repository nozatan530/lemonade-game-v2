import { describe, expect, it } from 'vitest';
import { CPU_TYPES } from '../engine/cpu-teams';
import { newSoloGame, SOLO_TEAM_COUNT, standLetter } from './local-game';

describe('ソロモードのお店の数', () => {
  it('何も指定しなければ4店（今までと同じ）', () => {
    const a = newSoloGame({ seed: 's1' });
    const b = newSoloGame({ seed: 's1', teamCount: 4 });
    expect(a.teams).toHaveLength(4);
    expect(b).toEqual(a);
  });

  it.each([3, 5, 8])('%i店：ロボット店長はお店の数−1、市場の大きさはお店の数に比例する', (n) => {
    const s = newSoloGame({ seed: 's2', difficulty: 'normal', teamCount: n });
    expect(s.teams).toHaveLength(n);
    expect(Object.keys(s.cpu)).toHaveLength(n - 1);
    expect(s.config.market.base).toBe(s.config.market.basePerTeam! * n);
    // ふつう以上は安売りを必ず入れる。作戦はどれも決められたもの
    expect(Object.values(s.cpu)).toContain('discount');
    for (const type of Object.values(s.cpu)) expect(CPU_TYPES).toContain(type);
  });

  it('ロボット店長が4店以上なら、4つの作戦をすべて使う', () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      const s = newSoloGame({ seed: 's3', difficulty, teamCount: 5 });
      expect(new Set(Object.values(s.cpu)).size).toBe(4);
    }
  });

  it('範囲の外は、3〜8にそろえる', () => {
    expect(newSoloGame({ seed: 's4', teamCount: 1 }).teams).toHaveLength(SOLO_TEAM_COUNT.min);
    expect(newSoloGame({ seed: 's4', teamCount: 20 }).teams).toHaveLength(SOLO_TEAM_COUNT.max);
  });

  it('お店の記号は B〜H', () => {
    expect(standLetter('t2')).toBe('B');
    expect(standLetter('t8')).toBe('H');
    expect(standLetter('t1')).toBeNull();
  });
});
