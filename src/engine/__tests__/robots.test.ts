import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { startTerm } from '../month';
import { assignCpuTypes, robotSubmissions, shuffleOrder } from '../robots';

describe('ロボット店長（ソロとルームで共通）', () => {
  it('作戦の割り当て：数がそろい、安売りを入れると必ず入る。同じシードなら同じ', () => {
    for (const n of [1, 2, 3, 5, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `r${i}`);
      const a = assignCpuTypes('s', ids, true);
      expect(Object.keys(a)).toEqual(ids);
      expect(Object.values(a)).toContain('discount');
      expect(assignCpuTypes('s', ids, true)).toEqual(a);
    }
    expect(assignCpuTypes('s', [], true)).toEqual({});
  });

  it('ロボットの提出は、ロボットのお店の分だけ出る', () => {
    const config = defaultConfig(3, 'r');
    const { teams, conditions } = startTerm(config, [
      { teamId: 't01', name: '人' }, { teamId: 't02', name: 'ロボ1' }, { teamId: 't03', name: 'ロボ2' },
    ]);
    const subs = robotSubmissions({
      config, teams, conditions, results: [], cpu: { t02: 'discount', t03: 'premium' }, skill: 'adaptive',
    });
    expect(subs.map((s) => s.teamId)).toEqual(['t02', 't03']);
  });

  it('提出順はシードと月で決まり、1から順に振られる', () => {
    const subs = ['a', 'b', 'c'].map((teamId) => ({ teamId, monthlyDecision: { lemonQty: 0, sugarQty: 0, price: 0 }, order: 0 }));
    const x = shuffleOrder(subs, 'seed', 3);
    expect(x.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(shuffleOrder(subs, 'seed', 3)).toEqual(x);
  });
});
