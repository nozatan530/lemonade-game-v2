import { describe, expect, it } from 'vitest';
import { TITLE_IDS, yearTitles, type YearTitleInput } from '../titles';
import type { MonthResult, TeamMonthResult, TeamState } from '../types';

const recipe = { lemon: 1, sugar: 1 }; // 材料費は1杯90円（レモン80＋砂糖10）

// 1店の1か月。ふつうは「50杯作って全部売れる・黒字」
const tm = (teamId: string, o: Partial<TeamMonthResult> = {}): TeamMonthResult => {
  const base = { price: 250, offered: 50, sold: 50, baristaCount: 1, lemonBought: 50, sugarBought: 50, costBarista: 2000, ...o };
  const unsold = o.unsold ?? base.offered - base.sold;
  const revenue = base.sold * base.price;
  const cost = base.lemonBought * 80 + base.sugarBought * 10 + base.costBarista;
  return {
    teamId, ...base, unsold, revenue, costLemon: base.lemonBought * 80, costSugar: base.sugarBought * 10,
    totalCost: cost, profit: o.profit ?? revenue - cost, usedLemon: base.offered, usedSugar: base.offered,
    stock: { lemon: 0, sugar: 0 }, balance: o.balance ?? 20000,
  };
};
// 12か月分。f(月) がその月の各店を返す。市場のお金はちょうど使い切られる（売り逃しなし）
const year = (f: (m: number) => TeamMonthResult[]): MonthResult[] => Array.from({ length: 12 }, (_, i) => {
  const teamResults = f(i + 1);
  return { month: i + 1, marketBudget: teamResults.reduce((a, t) => a + t.revenue, 0), prices: { lemon: 80, sugar: 10, barista: 2000 }, teamResults };
});
const standing = (teamId: string, balance: number, eliminatedMonth?: number): TeamState =>
  ({ teamId, name: teamId, balance, totalProfit: 0, stock: { lemon: 0, sugar: 0 }, baristaCount: 1, ...(eliminatedMonth ? { eliminatedMonth } : {}) });
const input = (results: MonthResult[], o: Partial<YearTitleInput> = {}): YearTitleInput => ({
  results, meId: 'me', recipe, baristaCapacity: 50, elimination: false,
  endStandings: [standing('me', 30000), standing('b', 29000), standing('c', 28000)], history: [], ...o,
});
const titles = (results: MonthResult[], o: Partial<YearTitleInput> = {}) => yearTitles(input(results, o));

describe('肩書き', () => {
  it('並びは表示の順（目立つ順）', () => {
    const r = titles(year(() => [tm('me'), tm('b', { price: 260 }), tm('c', { price: 270 })]));
    expect(r).toEqual(TITLE_IDS.filter((id) => r.includes(id)));
  });

  it('何もつかない年は、見習い店長だけ', () => {
    // 毎月赤字ではない・売れ残りも少しある・安くも高くもない、ありふれた年
    const r = year((m) => [
      tm('me', { price: 250, sold: m <= 3 ? 50 : 40, baristaCount: 2, costBarista: 4000, profit: m === 3 ? -100 : 1000 }),
      tm('b', { price: 240, sold: 50 }), tm('c', { price: 260, sold: 40 }),
    ]);
    const got = titles(r, { endStandings: [standing('me', 25000), standing('b', 26000), standing('c', 24000)] });
    expect(got).toEqual(['apprentice']);
  });

  it('👑 市場の覇者：1位で、2位との差が2割以上', () => {
    const r = year(() => [tm('me'), tm('b'), tm('c')]);
    expect(titles(r, { endStandings: [standing('me', 50000), standing('b', 30000), standing('c', 10000)] })).toContain('champion');
    expect(titles(r, { endStandings: [standing('me', 50000), standing('b', 45000), standing('c', 10000)] })).not.toContain('champion');
  });

  it('🟢 無敗の店長：12か月すべて黒字。1か月でも赤字ならつかない', () => {
    expect(titles(year(() => [tm('me'), tm('b')]))).toContain('neverRed');
    expect(titles(year((m) => [tm('me', { profit: m === 5 ? -1 : 100 }), tm('b')]))).not.toContain('neverRed');
  });

  it('⚔️ 価格破壊王：ほかのお店が脱落した月に、いちばん安かった（脱落ありのときだけ）', () => {
    const r = year((m) => [tm('me', { price: 200 }), { ...tm('b', { price: 210 }), ...(m === 4 ? { eliminated: true } : {}) }]);
    expect(titles(r, { elimination: true })).toContain('priceCrusher');
    expect(titles(r, { elimination: false })).not.toContain('priceCrusher');
    const pricier = year((m) => [tm('me', { price: 220 }), { ...tm('b', { price: 210 }), ...(m === 4 ? { eliminated: true } : {}) }]);
    expect(titles(pricier, { elimination: true })).not.toContain('priceCrusher');
  });

  it('🛡️ 最後の砦：3店以上で始めて、残り2店以下でも生き残った', () => {
    const r = year(() => [tm('me'), tm('b')]);
    const end = [standing('me', 30000), standing('b', 20000), standing('c', -100, 5), standing('d', -50, 8)];
    expect(titles(r, { elimination: true, endStandings: end })).toContain('lastStanding');
    expect(titles(r, { elimination: true, endStandings: [standing('me', 30000), standing('b', 20000), standing('c', 1000)] })).not.toContain('lastStanding');
  });

  it('🏔️ 下剋上・🚀 急成長店長・🧱 安定経営（2年目以降）', () => {
    const r = year(() => [tm('me'), tm('b')]); // 1年のもうけ 12 ×（12,500 − 6,500）= 72,000
    expect(titles(r, { history: [{ profit: 40000, rank: 3 }] })).toEqual(expect.arrayContaining(['underdog', 'risingFast']));
    expect(titles(r, { history: [{ profit: 60000, rank: 2 }] })).not.toContain('risingFast');
    expect(titles(r, { history: [{ profit: 60000, rank: 2 }] })).not.toContain('underdog');
    expect(titles(r, { history: [{ profit: 1, rank: 1 }, { profit: 1, rank: 1 }] })).toContain('steadyHand');
    expect(titles(r, { history: [{ profit: -1, rank: 1 }, { profit: 1, rank: 1 }] })).not.toContain('steadyHand');
    expect(titles(r)).not.toEqual(expect.arrayContaining(['underdog']));
  });

  it('📈 V字回復店長：前半は赤字、後半は黒字', () => {
    expect(titles(year((m) => [tm('me', { profit: m <= 6 ? -500 : 800 }), tm('b')]))).toContain('comeback');
    expect(titles(year((m) => [tm('me', { profit: m <= 6 ? 500 : 800 }), tm('b')]))).not.toContain('comeback');
  });

  it('🎯 読みの達人・♻️ エコ店長・🔥 売り切れ御免', () => {
    const perfect = titles(year(() => [tm('me'), tm('b', { price: 260 })]));
    expect(perfect).toEqual(expect.arrayContaining(['forecaster', 'zeroWaste', 'soldOutStar']));
    // 売り切れが8か月だけなら、売り切れ御免ではない
    expect(titles(year((m) => [tm('me', { sold: m <= 4 ? 49 : 50 }), tm('b')]))).not.toContain('soldOutStar');
    // 売れ残りが出たらエコ店長ではない。売り逃しが多ければ読みの達人ではない
    const leftover = titles(year((m) => [tm('me', { sold: m === 1 ? 49 : 50 }), tm('b')]));
    expect(leftover).not.toContain('zeroWaste');
    const missed = year(() => [tm('me'), tm('b')]).map((r) => ({ ...r, marketBudget: r.marketBudget + 10000 }));
    expect(titles(missed)).not.toContain('forecaster');
  });

  it('💎 高級路線の店長：平均の値段がいちばん高く、黒字', () => {
    expect(titles(year(() => [tm('me', { price: 400 }), tm('b', { price: 250 })]))).toContain('premium');
    // 順位が下半分ならつかない
    const low = [standing('me', 1000), standing('b', 29000), standing('c', 28000)];
    expect(titles(year(() => [tm('me', { price: 400 }), tm('b', { price: 250 })]), { endStandings: low })).not.toContain('premium');
    expect(titles(year(() => [tm('me', { price: 200 }), tm('b', { price: 250 })]))).not.toContain('premium');
  });

  it('📦 薄利多売の達人：売った数がいちばん多く、1杯のもうけは小さい', () => {
    const r = year(() => [
      tm('me', { price: 150, offered: 100, sold: 100, lemonBought: 100, sugarBought: 100, baristaCount: 2, costBarista: 4000 }),
      tm('b', { price: 300 }), tm('c', { price: 280 }),
    ]);
    expect(titles(r)).toContain('volumeSeller');
  });

  it('🛒 お客さんの味方：12か月ずっといちばん安い', () => {
    expect(titles(year(() => [tm('me', { price: 200 }), tm('b', { price: 250 })]))).toContain('customerFriend');
    expect(titles(year((m) => [tm('me', { price: m === 12 ? 260 : 200 }), tm('b', { price: 250 })]))).not.toContain('customerFriend');
  });

  it('🧑‍🍳 人使いの名人：毎月バリスタの9割以上を使い、半分以上の月は2人以上', () => {
    const two = { offered: 100, sold: 100, lemonBought: 100, sugarBought: 100, baristaCount: 2, costBarista: 4000 };
    expect(titles(year((m) => [tm('me', m <= 6 ? two : {}), tm('b')]))).toContain('teamMaster');
    expect(titles(year((m) => [tm('me', m <= 5 ? two : {}), tm('b')]))).not.toContain('teamMaster');
    expect(titles(year(() => [tm('me', { baristaCount: 2, costBarista: 4000 }), tm('b')]))).not.toContain('teamMaster');
  });

  it('🧘 慎重派：静観した月があり、赤字は1回まで', () => {
    const watch = { price: 0, offered: 0, sold: 0, lemonBought: 0, sugarBought: 0, profit: -2000 };
    expect(titles(year((m) => [tm('me', m === 1 ? watch : {}), tm('b')]))).toContain('careful');
    expect(titles(year((m) => [tm('me', m <= 2 ? watch : {}), tm('b')]))).not.toContain('careful');
  });

  it('🌧️ 七転び八起き：赤字の月が6回以上でも最後まで続けた', () => {
    expect(titles(year((m) => [tm('me', { profit: m % 2 ? -100 : 100 }), tm('b')]))).toContain('neverGiveUp');
    const out = [standing('me', -100, 12), standing('b', 1000)];
    expect(titles(year((m) => [tm('me', { profit: m % 2 ? -100 : 100 }), tm('b')]), { endStandings: out })).not.toContain('neverGiveUp');
  });

  it('🍋 レモン長者：売れ残りがいちばん多く、3割以上', () => {
    expect(titles(year(() => [tm('me', { sold: 30 }), tm('b', { sold: 45 })]))).toContain('lemonHoarder');
    expect(titles(year(() => [tm('me', { sold: 45 }), tm('b', { sold: 30 })]))).not.toContain('lemonHoarder');
  });

  it('💸 大盤振る舞い：材料費（90円）より安く売った月が3回以上', () => {
    expect(titles(year((m) => [tm('me', { price: m <= 3 ? 80 : 250 }), tm('b')]))).toContain('tooGenerous');
    expect(titles(year((m) => [tm('me', { price: m <= 2 ? 80 : 250 }), tm('b')]))).not.toContain('tooGenerous');
  });

  it('その年に営業していなければ（脱落のあと）、見習い店長', () => {
    expect(titles(year(() => [tm('b')]))).toEqual(['apprentice']);
  });
});
