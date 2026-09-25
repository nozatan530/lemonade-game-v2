import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { CPU_TYPES, cpuViewOf, decideCpu } from '../cpu-teams';
import { closeMonth, openNextMonth, startTerm } from '../month';
import { seededRand } from '../random';
import type { CpuType, CpuView, MonthConditions, MonthlyDecision, MonthResult, Submission, TeamState } from '../types';

const dice = (id: string) => (k: number) => seededRand(`dice:${id}`, k);

// 4つの作戦の CPU だけで12か月を回す
function simulate(seed: string, scenario: 'none' | 'summer' | 'inflation' | 'chaos' = 'none') {
  const config = defaultConfig(4, seed);
  config.scenario = scenario;
  const types: Record<string, CpuType> = { t1: 'discount', t2: 'premium', t3: 'follower', t4: 'cautious' };
  let { teams, conditions } = startTerm(config, Object.keys(types).map((id) => ({ teamId: id, name: id })));
  let cond: MonthConditions | null = conditions;
  const results: MonthResult[] = [];
  let decided: Record<string, MonthlyDecision> = {};
  while (cond) {
    const c: MonthConditions = cond;
    const subs: Submission[] = teams.map((t, i) => {
      const view = cpuViewOf({
        month: c.month, prices: c.prices,
        rules: { baristaCapacity: config.baristaCapacity, recipe: config.recipe, teamCount: teams.length },
        me: t, results,
      });
      const d = decideCpu(types[t.teamId]!, view, (k) => dice(t.teamId)(c.month * 100 + k));
      return { teamId: t.teamId, ...d, order: i + 1 };
    });
    const r = closeMonth(config, teams, c, subs, decided);
    teams = r.teams;
    decided = r.decided;
    results.push(r.result);
    cond = openNextMonth(config, c.month, teams.length, c.prices);
  }
  return { results, teams, types };
}

function baseView(overrides: Partial<CpuView> = {}): CpuView {
  const me: TeamState = { teamId: 'c1', name: 'C', balance: 10000, totalProfit: 0, stock: { lemon: 0, sugar: 0 }, baristaCount: 1 };
  return {
    month: 1, quarterStart: true, prices: { lemon: 80, sugar: 10, barista: 2000 },
    rules: { baristaCapacity: 50, recipe: { lemon: 1, sugar: 1 }, teamCount: 4 },
    me, history: [], ...overrides,
  };
}

describe('decideCpu', () => {
  it('同じ情報とサイコロなら、同じ決定になる', () => {
    for (const type of CPU_TYPES) {
      expect(decideCpu(type, baseView(), dice('x'))).toEqual(decideCpu(type, baseView(), dice('x')));
    }
  });

  it('決定は0以上の整数で、売るなら値段は10円以上。作る数はバリスタの上限まで', () => {
    const { results } = simulate('valid');
    for (const r of results) {
      for (const t of r.teamResults) {
        for (const v of [t.lemonBought, t.sugarBought, t.price, t.offered, t.baristaCount]) {
          expect(Number.isInteger(v) && v >= 0).toBe(true);
        }
        if (t.offered > 0) expect(t.price).toBeGreaterThanOrEqual(10);
        expect(t.offered).toBeLessThanOrEqual(t.baristaCount * 50);
      }
    }
  });

  it('バリスタの人数は四半期の最初の月だけ決める', () => {
    expect(decideCpu('discount', baseView({ month: 1, quarterStart: true }), dice('x')).quarterlyDecision).toBeDefined();
    expect(decideCpu('discount', baseView({ month: 2, quarterStart: false }), dice('x')).quarterlyDecision).toBeUndefined();
  });

  it('在庫があれば、その分だけ仕入れを減らす', () => {
    const withStock = baseView();
    withStock.me = { ...withStock.me, stock: { lemon: 20, sugar: 5 } };
    const a = decideCpu('premium', baseView(), dice('x')).monthlyDecision;
    const b = decideCpu('premium', withStock, dice('x')).monthlyDecision;
    expect(a.lemonQty - b.lemonQty).toBe(20);
    expect(a.sugarQty - b.sugarQty).toBe(5);
  });

  it('慎重タイプは、お金が1か月分の費用より少なければ静観する', () => {
    const poor = baseView({ month: 2, quarterStart: false });
    poor.me = { ...poor.me, balance: 1000 };
    expect(decideCpu('cautious', poor, dice('x')).monthlyDecision.watching).toBe(true);
  });
});

describe('CPU は今月の市場予算を見ない', () => {
  it('cpuViewOf は今月より前の結果だけを渡す', () => {
    const r = (month: number): MonthResult => ({ month, marketBudget: 1, prices: { lemon: 1, sugar: 1, barista: 1 }, teamResults: [] });
    const view = cpuViewOf({
      month: 3, prices: { lemon: 80, sugar: 10, barista: 2000 },
      rules: { baristaCapacity: 50, recipe: { lemon: 1, sugar: 1 }, teamCount: 4 },
      me: baseView().me, results: [r(1), r(2), r(3)],
    });
    expect(view.history.map((h) => h.month)).toEqual([1, 2]);
  });

  it('今月の市場予算がいくらでも、CPU の決定は変わらない', () => {
    // 今月の結果（市場予算を含む）を誤って渡しても、cpuViewOf が取り除く。予算を変えても決定は同じ
    const { results } = simulate('budget');
    const past = results.slice(0, 4);
    const me = { ...baseView().me, teamId: 't1' };
    const decide = (currentBudget: number) => {
      const leaked: MonthResult = { ...results[4]!, marketBudget: currentBudget };
      const view = cpuViewOf({
        month: 5, prices: results[4]!.prices,
        rules: { baristaCapacity: 50, recipe: { lemon: 1, sugar: 1 }, teamCount: 4 },
        me, results: [...past, leaked],
      });
      return CPU_TYPES.map((t) => decideCpu(t, view, dice('b')));
    };
    expect(decide(1000)).toEqual(decide(50000));
    expect(decide(999999)).toEqual(decide(50000));
  });
});

describe('作戦の違いが結果に出る（12か月）', () => {
  const seeds = ['s1', 's2', 's3', 's4', 's5'];

  function stats(seed: string, scenario?: 'none' | 'summer' | 'inflation' | 'chaos') {
    const { results, types } = simulate(seed, scenario);
    const by = (type: CpuType) => {
      const id = Object.keys(types).find((k) => types[k] === type)!;
      const rows = results.map((r) => r.teamResults.find((t) => t.teamId === id)!).filter((t) => t.offered > 0);
      return {
        avgPrice: rows.reduce((a, t) => a + t.price, 0) / Math.max(1, rows.length),
        unsold: results.reduce((a, r) => a + r.teamResults.find((t) => t.teamId === id)!.unsold, 0),
        offered: rows.reduce((a, t) => a + t.offered, 0),
      };
    };
    return { discount: by('discount'), premium: by('premium'), follower: by('follower'), cautious: by('cautious') };
  }

  it('平均の値段は「安売り < 追随 < 高値」', () => {
    for (const seed of seeds) {
      const s = stats(seed);
      expect(s.discount.avgPrice).toBeLessThan(s.follower.avgPrice);
      expect(s.follower.avgPrice).toBeLessThan(s.premium.avgPrice);
    }
  });

  it('安売りがいちばん多く売りに出し、慎重の売れ残りがいちばん少ない', () => {
    for (const seed of seeds) {
      const s = stats(seed);
      expect(s.discount.offered).toBeGreaterThan(Math.max(s.premium.offered, s.follower.offered, s.cautious.offered));
      expect(s.cautious.unsold).toBeLessThanOrEqual(Math.min(s.discount.unsold, s.premium.unsold, s.follower.unsold));
    }
  });

  it('シナリオがあっても最後まで動き、数値がおかしくならない', () => {
    for (const scenario of ['summer', 'inflation', 'chaos'] as const) {
      const { teams } = simulate('scn', scenario);
      for (const t of teams) expect(Number.isFinite(t.balance)).toBe(true);
    }
  });
});
