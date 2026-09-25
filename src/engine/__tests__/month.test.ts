import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { fillMissingSubmissions, initialTeamState, resolveMonth } from '../month';
import type { MonthConditions, MonthlyDecision, Submission } from '../types';

const config = defaultConfig(2, 'test');
const prices = { lemon: 80, sugar: 10, barista: 2000 };
const cond = (month: number, marketBudget: number): MonthConditions => ({ month, marketBudget, prices });
const sub = (teamId: string, d: MonthlyDecision, order: number, baristaCount?: number): Submission => ({
  teamId,
  monthlyDecision: d,
  order,
  ...(baristaCount !== undefined ? { quarterlyDecision: { baristaCount } } : {}),
});

describe('resolveMonth', () => {
  const teams = [initialTeamState('A', 'Aチーム', config), initialTeamState('B', 'Bチーム', config)];

  it('月次損益：売上 − 原価 − 人件費 ＝ 利益。資金に反映される', () => {
    const { teams: next, result } = resolveMonth(config, teams, cond(1, 100000), [
      sub('A', { lemonQty: 50, sugarQty: 50, price: 200 }, 1, 1),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, 2, 0),
    ]);
    const a = result.teamResults[0]!;
    expect(a.sold).toBe(50);
    expect(a.revenue).toBe(10000);
    expect(a.costLemon).toBe(4000);
    expect(a.costSugar).toBe(500);
    expect(a.costBarista).toBe(2000);
    expect(a.profit).toBe(3500);
    expect(next[0]!.balance).toBe(13500);
  });

  it('初級は仕入れた分がその月の原価になる（在庫に回った分も含む）', () => {
    const { result } = resolveMonth(config, teams, cond(1, 100000), [
      sub('A', { lemonQty: 80, sugarQty: 80, price: 200, maxSell: 30 }, 1, 1),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, 2, 0),
    ]);
    const a = result.teamResults[0]!;
    expect(a.offered).toBe(30);
    expect(a.stock).toEqual({ lemon: 50, sugar: 50 });
    expect(a.costLemon).toBe(80 * 80);
  });

  it('売れ残りは廃棄として記録し、材料は在庫に戻らない', () => {
    const { result } = resolveMonth(config, teams, cond(1, 2000), [
      sub('A', { lemonQty: 50, sugarQty: 50, price: 200 }, 1, 1),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, 2, 0),
    ]);
    const a = result.teamResults[0]!;
    expect(a.sold).toBe(10);
    expect(a.unsold).toBe(40);
    expect(a.stock).toEqual({ lemon: 0, sugar: 0 });
  });

  it('バリスタは四半期の最初の月だけ変えられ、それ以外の月は引き継ぐ', () => {
    let state = teams;
    const r1 = resolveMonth(config, state, cond(1, 0), [
      sub('A', { lemonQty: 0, sugarQty: 0, price: 0 }, 1, 2),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0 }, 2, 1),
    ]);
    state = r1.teams;
    // 2か月目に四半期の決定を送っても無視される
    const r2 = resolveMonth(config, state, cond(2, 0), [
      sub('A', { lemonQty: 0, sugarQty: 0, price: 0 }, 1, 5),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0 }, 2),
    ]);
    expect(r2.teams.map((t) => t.baristaCount)).toEqual([2, 1]);
    const r4 = resolveMonth(config, r2.teams, cond(4, 0), [
      sub('A', { lemonQty: 0, sugarQty: 0, price: 0 }, 1, 3),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0 }, 2),
    ]);
    expect(r4.teams.map((t) => t.baristaCount)).toEqual([3, 1]);
  });

  it('静観した月も、雇っているバリスタの給与はかかる', () => {
    const hired = teams.map((t) => ({ ...t, baristaCount: 2 }));
    const { result } = resolveMonth(config, hired, cond(2, 100000), [
      sub('A', { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, 1),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, 2),
    ]);
    expect(result.teamResults[0]!.costBarista).toBe(4000);
    expect(result.teamResults[0]!.profit).toBe(-4000);
  });

  it('在庫は2か月にわたって繰り越される', () => {
    const r1 = resolveMonth(config, teams, cond(1, 100000), [
      sub('A', { lemonQty: 100, sugarQty: 100, price: 100, maxSell: 30 }, 1, 1),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0 }, 2, 0),
    ]);
    const r2 = resolveMonth(config, r1.teams, cond(2, 100000), [
      sub('A', { lemonQty: 0, sugarQty: 0, price: 100, maxSell: 30 }, 1),
      sub('B', { lemonQty: 0, sugarQty: 0, price: 0 }, 2),
    ]);
    expect(r2.result.teamResults[0]!.sold).toBe(30);
    expect(r2.teams[0]!.stock).toEqual({ lemon: 40, sugar: 40 });
  });

  it('同じ入力なら同じ結果になる', () => {
    const subs = [
      sub('A', { lemonQty: 40, sugarQty: 40, price: 150 }, 1, 1),
      sub('B', { lemonQty: 40, sugarQty: 40, price: 150 }, 2, 1),
    ];
    expect(resolveMonth(config, teams, cond(1, 3000), subs)).toEqual(resolveMonth(config, teams, cond(1, 3000), subs));
  });
});

describe('fillMissingSubmissions（未提出チーム）', () => {
  const teams = ['A', 'B', 'C'].map((id) => initialTeamState(id, id, config));

  it('未提出のチームは前月と同じ決定、前月がなければ静観。順番は提出済みの後', () => {
    const prev = new Map<string, MonthlyDecision>([['B', { lemonQty: 10, sugarQty: 10, price: 150 }]]);
    const filled = fillMissingSubmissions(teams, [sub('A', { lemonQty: 1, sugarQty: 1, price: 100 }, 5)], prev);
    expect(filled).toEqual([
      sub('A', { lemonQty: 1, sugarQty: 1, price: 100 }, 5),
      { teamId: 'B', monthlyDecision: { lemonQty: 10, sugarQty: 10, price: 150 }, order: 6 },
      { teamId: 'C', monthlyDecision: { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, order: 7 },
    ]);
  });
});
