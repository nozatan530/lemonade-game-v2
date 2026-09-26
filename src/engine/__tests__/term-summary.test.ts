import { describe, expect, it } from 'vitest';
import { termSummary } from '../accounting';
import { defaultConfig } from '../config';
import { closeMonth, openNextMonth, startTerm } from '../month';
import type { MonthConditions, MonthlyDecision, MonthResult, Submission } from '../types';

const config = defaultConfig(2, 'summary');

// 2チームで12か月。A は毎月 50杯を 250円、B は毎月 60杯を 200円（B が先に売れる）
function play(budgetOf: (month: number) => number): MonthResult[] {
  let { teams, conditions } = startTerm(config, [{ teamId: 'A', name: 'A' }, { teamId: 'B', name: 'B' }]);
  let cond: MonthConditions | null = conditions;
  let decided: Record<string, MonthlyDecision> = {};
  const results: MonthResult[] = [];
  while (cond) {
    const c: MonthConditions = { ...cond, marketBudget: budgetOf(cond.month) };
    const subs: Submission[] = [
      { teamId: 'A', monthlyDecision: { lemonQty: 50, sugarQty: 50, price: 250 }, order: 1 },
      { teamId: 'B', monthlyDecision: { lemonQty: 60, sugarQty: 60, price: 200 }, order: 2, ...(c.month === 1 ? { quarterlyDecision: { baristaCount: 2 } } : {}) },
    ];
    const r = closeMonth(config, teams, c, subs, decided);
    teams = r.teams;
    decided = r.decided;
    results.push(r.result);
    cond = openNextMonth(config, c.month, 2, c.prices);
  }
  return results;
}

describe('termSummary（期末の振り返り）', () => {
  // 月によって市場の大きさを変える：3月目は大きく（Aも全部売れる）、7月目は小さく（Aは売れない）
  const results = play((m) => (m === 3 ? 100000 : m === 7 ? 5000 : 20000));
  const s = termSummary(results, 'A', config.recipe);

  it('12か月分の行がある', () => {
    expect(s.rows.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('合計は各月の結果の合計と一致し、もうけの合計は資金の増えた分と同じ', () => {
    const a = results.map((r) => r.teamResults.find((t) => t.teamId === 'A')!);
    expect(s.totalRevenue).toBe(a.reduce((x, t) => x + t.revenue, 0));
    expect(s.totalMaterialCost + s.totalLaborCost).toBe(a.reduce((x, t) => x + t.totalCost, 0));
    expect(s.totalProfit).toBe(s.totalRevenue - s.totalMaterialCost - s.totalLaborCost);
    expect(s.totalProfit).toBe(s.rows.at(-1)!.balance - config.startFund);
  });

  it('いちばんもうかった月と、いちばん損した月', () => {
    expect(s.bestMonth!.month).toBe(3);
    expect(s.worstMonth!.month).toBe(7);
    expect(s.worstMonth!.sold).toBe(0);
  });

  it('売れ残りの数と、売れ残りに使った材料の金額', () => {
    const month7 = s.rows.find((r) => r.month === 7)!;
    expect(month7.unsold).toBe(50);
    expect(month7.wasteValue).toBe(50 * 90); // 1杯の材料費 90円
    expect(s.totalUnsold).toBe(s.rows.reduce((x, r) => x + r.unsold, 0));
    expect(s.totalWasteValue).toBe(s.rows.reduce((x, r) => x + r.wasteValue, 0));
  });

  it('売れた割合', () => {
    expect(s.sellThrough).toBeCloseTo(s.totalSold / s.totalOffered);
  });

  it('結果がなければ、月の行も最良・最悪の月もない', () => {
    const empty = termSummary([], 'A', config.recipe);
    expect(empty.rows).toEqual([]);
    expect(empty.bestMonth).toBeNull();
    expect(empty.sellThrough).toBeNull();
  });
});
