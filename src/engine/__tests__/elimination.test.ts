import { describe, expect, it } from 'vitest';
import { termSummary } from '../accounting';
import { defaultConfig } from '../config';
import { closeMonth, isActive, openNextMonth, rankTeams, startTerm } from '../month';
import type { GameConfig, MonthlyDecision, Submission } from '../types';

// 4か月目までの短い期で試す。市場は変動なし
const base = (elimination: boolean): GameConfig => ({ ...defaultConfig(2, 'elim'), months: 4, elimination });

// 大量に仕入れて高すぎる値段で売る（まったく売れず、大きく損をする）
const reckless: MonthlyDecision = { lemonQty: 150, sugarQty: 150, price: 1_000_000 };
const normal: MonthlyDecision = { lemonQty: 50, sugarQty: 50, price: 250 };
const subs = (a: MonthlyDecision, b: MonthlyDecision): Submission[] => [
  { teamId: 'a', monthlyDecision: a, quarterlyDecision: { baristaCount: 3 }, order: 1 },
  { teamId: 'b', monthlyDecision: b, order: 2 },
];

describe('脱落あり', () => {
  it('月末の資金がマイナスになったお店は、その月で脱落する', () => {
    const config = base(true);
    const { teams, conditions } = startTerm(config, [{ teamId: 'a', name: 'A' }, { teamId: 'b', name: 'B' }]);
    const r = closeMonth(config, teams, conditions, subs(reckless, normal), {});
    const a = r.teams.find((t) => t.teamId === 'a')!;
    expect(a.balance).toBeLessThan(0);
    expect(a.eliminatedMonth).toBe(1);
    expect(r.result.teamResults.find((t) => t.teamId === 'a')!.eliminated).toBe(true);
    // 黒字のお店は続ける
    expect(isActive(r.teams.find((t) => t.teamId === 'b')!)).toBe(true);
    expect(r.result.teamResults.find((t) => t.teamId === 'b')!.eliminated).toBeUndefined();
  });

  it('脱落したお店は、次の月から提出がなくても処理され、費用もかからず、結果にも出ない', () => {
    const config = base(true);
    let { teams, conditions } = startTerm(config, [{ teamId: 'a', name: 'A' }, { teamId: 'b', name: 'B' }]);
    let r = closeMonth(config, teams, conditions, subs(reckless, normal), {});
    const balanceAfter = r.teams.find((t) => t.teamId === 'a')!.balance;
    teams = r.teams;
    conditions = openNextMonth(config, 1, teams.length, r.result.prices)!;
    // 2か月目：B だけが提出する（A の分は補われない）
    r = closeMonth(config, teams, conditions, [{ teamId: 'b', monthlyDecision: normal, order: 1 }], r.decided);
    expect(r.result.teamResults.map((t) => t.teamId)).toEqual(['b']);
    const a = r.teams.find((t) => t.teamId === 'a')!;
    expect(a.balance).toBe(balanceAfter);
    expect(a.eliminatedMonth).toBe(1);
    expect(r.decided.a).toBeUndefined();
    // 並び順は変わらない
    expect(r.teams.map((t) => t.teamId)).toEqual(['a', 'b']);
    // 振り返りは脱落した月までの行になる
    expect(termSummary([r.result], 'a', config.recipe).rows).toHaveLength(0);
  });

  it('脱落なし（初期設定）では、資金がマイナスでも続けられる', () => {
    const config = base(false);
    const { teams, conditions } = startTerm(config, [{ teamId: 'a', name: 'A' }, { teamId: 'b', name: 'B' }]);
    const r = closeMonth(config, teams, conditions, subs(reckless, normal), {});
    const a = r.teams.find((t) => t.teamId === 'a')!;
    expect(a.balance).toBeLessThan(0);
    expect(a.eliminatedMonth).toBeUndefined();
    expect(r.result.teamResults.find((t) => t.teamId === 'a')!.eliminated).toBeUndefined();
  });

  it('資金がちょうど0円なら脱落しない', () => {
    const config = { ...base(true), startFund: 2000 };
    const { teams, conditions } = startTerm(config, [{ teamId: 'a', name: 'A' }, { teamId: 'b', name: 'B' }]);
    // 静観：バリスタ1人の給料 2,000円だけかかる
    const r = closeMonth(config, teams, conditions, [
      { teamId: 'a', monthlyDecision: { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, order: 1 },
      { teamId: 'b', monthlyDecision: normal, order: 2 },
    ], {});
    const a = r.teams.find((t) => t.teamId === 'a')!;
    expect(a.balance).toBe(0);
    expect(isActive(a)).toBe(true);
  });
});

describe('最終順位', () => {
  it('資金の多い順。脱落したお店は下で、長く続いたお店ほど上', () => {
    const ranked = rankTeams([
      { id: 'out1', balance: -100, eliminatedMonth: 3 },
      { id: 'low', balance: 500 },
      { id: 'out2', balance: -5000, eliminatedMonth: 8 },
      { id: 'high', balance: 20000 },
    ]);
    expect(ranked.map((t) => t.id)).toEqual(['high', 'low', 'out2', 'out1']);
  });
});
