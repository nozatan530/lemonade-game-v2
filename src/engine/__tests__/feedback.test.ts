import { describe, expect, it } from 'vitest';
import { missedCups, monthInsights, moneyFlow, termFeedback } from '../feedback';
import type { MonthResult, TeamMonthResult } from '../types';

const recipe = { lemon: 1, sugar: 1 };
const team = (teamId: string, o: Partial<TeamMonthResult>): TeamMonthResult => ({
  teamId, price: 200, offered: 50, sold: 50, unsold: 0, revenue: 0, lemonBought: 50, sugarBought: 50, baristaCount: 1,
  costLemon: 4000, costSugar: 500, costBarista: 2000, totalCost: 6500, profit: 0, usedLemon: 50, usedSugar: 50,
  stock: { lemon: 0, sugar: 0 }, balance: 10000, ...o,
});
const month = (marketBudget: number, teams: TeamMonthResult[]): MonthResult => ({
  month: 2, marketBudget, prices: { lemon: 80, sugar: 10, barista: 2000 },
  teamResults: teams.map((t) => ({ ...t, revenue: t.revenue || t.sold * t.price })),
});

describe('お客さんのお金の行き先', () => {
  it('お店ごとの売上（多い順）と、使われずに残ったお金', () => {
    const r = month(30000, [team('a', { price: 200, sold: 50 }), team('b', { price: 300, sold: 30, offered: 30 })]);
    const f = moneyFlow(r);
    expect(f.byTeam.map((t) => t.teamId)).toEqual(['a', 'b']);
    expect(f.unspent).toBe(30000 - 10000 - 9000);
  });
});

describe('売り逃し', () => {
  it('売り切れたとき、使われずに残ったお金で、同じ値段であと何杯売れたか', () => {
    // 市場 30,000円。a 200円×50杯＝10,000円、b 150円×40杯＝6,000円 → 残り 14,000円 → 200円なら70杯
    const r = month(30000, [team('a', { price: 200, sold: 50 }), team('b', { price: 150, sold: 40, offered: 40 })]);
    expect(missedCups(r, 'a')).toBe(70);
  });

  it('ほかのお店で買ったお客さんは数えない（お金が残っていなければ 0）', () => {
    const r = month(20000, [team('a', { price: 200, sold: 50 }), team('b', { price: 400, sold: 25, offered: 25 })]);
    expect(missedCups(r, 'a')).toBe(0);
  });

  it('売れ残ったときや、静観したときは 0', () => {
    expect(missedCups(month(5000, [team('a', { sold: 25, unsold: 25 })]), 'a')).toBe(0);
    expect(missedCups(month(5000, [team('a', { offered: 0, sold: 0, price: 0 })]), 'a')).toBe(0);
  });
});

describe('月のコメント', () => {
  it('売り切れて、まだ売れた → soldOutMissed、何番目に安いか', () => {
    const r = month(30000, [team('a', { price: 200 }), team('b', { price: 150, sold: 40, offered: 40 })]);
    const i = monthInsights(r, 'a', recipe, 50)!;
    expect(i.notes.map((n) => n.id)).toEqual(['soldOutMissed', 'priceRank']);
    expect(i.notes[0]!.params).toEqual({ missed: 70, revenue: 14000 });
    expect(i.priceRank).toBe(2);
  });

  it('売れ残り → unsold（捨てた材料の金額と、いちばん安い値段）', () => {
    const r = month(5000, [team('a', { price: 250, sold: 20, unsold: 30 }), team('b', { price: 180, sold: 0, offered: 10, unsold: 10 })]);
    const n = monthInsights(r, 'a', recipe, 50)!.notes.find((x) => x.id === 'unsold')!;
    expect(n.params).toMatchObject({ unsold: 30, waste: 30 * 90, cheapest: 180 });
  });

  it('材料費より安い値段 → belowMaterial。給料まで入れて赤字 → lossAfterWages', () => {
    const cheap = monthInsights(month(99999, [team('a', { price: 80 })]), 'a', recipe, 50)!;
    expect(cheap.notes.map((n) => n.id)).toContain('belowMaterial');
    const wages = monthInsights(month(99999, [team('a', { price: 120, profit: -500, sold: 50 })]), 'a', recipe, 50)!;
    expect(wages.notes.map((n) => n.id)).toContain('lossAfterWages');
  });

  it('バリスタが作れる数の半分より少なく作った → idleBaristas', () => {
    const r = month(99999, [team('a', { baristaCount: 3, offered: 50, sold: 50 })]);
    expect(monthInsights(r, 'a', recipe, 50)!.notes.find((n) => n.id === 'idleBaristas')!.params).toMatchObject({ capacity: 150, made: 50 });
  });

  it('静観・作れなかった・脱落', () => {
    expect(monthInsights(month(9999, [team('a', { offered: 0, sold: 0, price: 0, lemonBought: 0, sugarBought: 0 })]), 'a', recipe, 50)!.notes[0]!.id).toBe('watching');
    expect(monthInsights(month(9999, [team('a', { offered: 0, sold: 0, price: 0, sugarBought: 0 })]), 'a', recipe, 50)!.notes[0]!.id).toBe('noCups');
    expect(monthInsights(month(9999, [team('a', { eliminated: true, balance: -300 })]), 'a', recipe, 50)!.notes[0]).toEqual({ id: 'eliminated', params: { balance: -300 } });
  });

  it('お客さんのお金が先月より1割以上変わったら知らせる', () => {
    const prev = month(20000, [team('a', {})]);
    const up = monthInsights(month(25000, [team('a', {})]), 'a', recipe, 50, prev)!;
    expect(up.notes.find((n) => n.id === 'marketUp')!.params.pct).toBe(25);
    const same = monthInsights(month(21000, [team('a', {})]), 'a', recipe, 50, prev)!;
    expect(same.notes.some((n) => n.id === 'marketUp' || n.id === 'marketDown')).toBe(false);
    expect(monthInsights(month(15000, [team('a', {})]), 'a', recipe, 50, prev)!.notes.some((n) => n.id === 'marketDown')).toBe(true);
  });

  it('その月に行がない（脱落した後）なら null', () => {
    expect(monthInsights(month(9999, [team('b', {})]), 'a', recipe, 50)).toBeNull();
  });
});

describe('1年の振り返り（結果シート）', () => {
  const year = (teams: (m: number) => TeamMonthResult[], budget = 20000) =>
    Array.from({ length: 12 }, (_, i) => ({ ...month(budget, teams(i + 1)), month: i + 1 }));
  const final = { rank: 1, teamCount: 2 };

  it('いつもいちばん安い → 安売りタイプ。いつもいちばん高い → 高値タイプ', () => {
    const r = year(() => [team('a', { price: 150 }), team('b', { price: 250 })], 99999);
    expect(termFeedback(r, 'a', recipe, 50, final).style).toBe('discount');
    expect(termFeedback(r, 'b', recipe, 50, { rank: 2, teamCount: 2 }).style).toBe('premium');
  });

  it('真ん中の値段で、控えめに作って売り逃しが多い → 慎重タイプ。そうでなければ追随タイプ', () => {
    const three = (sold: number) => () => [
      team('a', { price: 150 }), team('b', { price: 200, sold, offered: sold }), team('c', { price: 300, sold: 0, unsold: 10, offered: 10 }),
    ];
    expect(termFeedback(year(three(20), 99999), 'b', recipe, 50, final).style).toBe('cautious');
    expect(termFeedback(year(three(50), 16000), 'b', recipe, 50, final).style).toBe('follower');
  });


  it('次に挑戦したいこと：売れ残り・売り逃し・赤字の月・材料費より安い・給料のむだ', () => {
    const unsold = termFeedback(year(() => [team('a', { sold: 20, unsold: 30 })]), 'a', recipe, 50, final);
    expect(unsold.next.map((n) => n.id)).toContain('unsold');
    const missed = termFeedback(year(() => [team('a', { price: 200 })], 30000), 'a', recipe, 50, final);
    expect(missed.next[0]).toMatchObject({ id: 'missed', params: { cups: 12 * 100 } });
    expect(missed.totalMissed).toBe(1200);
    const loss = termFeedback(year((m) => [team('a', { profit: m === 3 ? -900 : m === 7 ? -200 : 500 })]), 'a', recipe, 50, final);
    expect(loss.next.find((n) => n.id === 'lossMonths')!.params).toEqual({ count: 2, month: 3, profit: -900 });
    const below = termFeedback(year(() => [team('a', { price: 50 })], 99999), 'a', recipe, 50, final);
    expect(below.next[0]!.id).toBe('belowMaterial');
    const idle = termFeedback(year(() => [team('a', { baristaCount: 3 })], 10000), 'a', recipe, 50, final);
    expect(idle.next.map((n) => n.id)).toContain('idle');
  });

  it('課題がなければ noIssue。よかったところと次の課題は多くて3つ', () => {
    const ok = termFeedback(year(() => [team('a', { profit: 1000 })], 10000), 'a', recipe, 50, final);
    expect(ok.next).toEqual([{ id: 'noIssue', params: {} }]);
    expect(ok.good.length).toBeLessThanOrEqual(3);
    expect(ok.good[0]!.id).toBe('rankFirst');
  });

  it('脱落したら、最初の課題は脱落。最後まで続けたとは言わない', () => {
    const r = year(() => [team('a', {})]).slice(0, 4);
    const f = termFeedback(r, 'a', recipe, 50, { rank: 4, teamCount: 4, eliminatedMonth: 4 });
    expect(f.next[0]).toEqual({ id: 'eliminated', params: { month: 4 } });
    expect(f.good.some((n) => n.id === 'survived')).toBe(false);
  });
});
