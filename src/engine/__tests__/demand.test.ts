import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { autoMonthValues } from '../demand';

describe('autoMonthValues（シナリオなしの市場予算と原価）', () => {
  it('市場予算は毎月変わり、基準額 ±変動幅 の範囲に収まる', () => {
    for (const seed of ['g1790312960315', 'lemon2025', 'x']) {
      const config = defaultConfig(4, seed);
      const budgets = Array.from({ length: 12 }, (_, i) => autoMonthValues(i + 1, config).marketBudget);
      expect(new Set(budgets).size).toBeGreaterThanOrEqual(6);
      for (const b of budgets) {
        expect(b).toBeGreaterThanOrEqual(80000 * 0.7);
        expect(b).toBeLessThanOrEqual(80000 * 1.3);
      }
    }
  });

  it('原価が「ランダム」なら、単価も毎月変わる', () => {
    const config = defaultConfig(4, 'lemon2025');
    config.market.costMode = 'random';
    const lemons = Array.from({ length: 12 }, (_, i) => autoMonthValues(i + 1, config).prices.lemon);
    expect(new Set(lemons).size).toBeGreaterThanOrEqual(6);
  });

  it('同じシードなら、何度計算しても同じ', () => {
    const config = defaultConfig(4, 'same');
    expect(autoMonthValues(5, config)).toEqual(autoMonthValues(5, config));
  });
});
