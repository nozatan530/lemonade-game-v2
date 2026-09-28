// 振り返り用の読み取り：月の結果から「何が起きたか」を数字で取り出し、コメントの種類を選ぶ。
// 文章はつくらない（画面が辞書から文を出す）。数字はすべてここで計算する。

import type { MonthResult, Recipe } from './types';

// お客さんのお金の行き先（お店ごとの売上と、使われずに残ったお金）
export interface MoneyFlow {
  byTeam: { teamId: string; revenue: number }[]; // 売上の多い順
  unspent: number; // 使われずに残ったお金（どのお店も売り切れたか、残りのお金では買えない値段だった）
}

export function moneyFlow(result: MonthResult): MoneyFlow {
  const byTeam = result.teamResults
    .map((t) => ({ teamId: t.teamId, revenue: t.revenue }))
    .sort((a, b) => b.revenue - a.revenue);
  const spent = byTeam.reduce((a, t) => a + t.revenue, 0);
  return { byTeam, unspent: Math.max(0, result.marketBudget - spent) };
}

// 売り逃し：売り切れたとき、買えずに帰ったお客さんのお金（使われずに残ったお金）で、同じ値段であと何杯売れたか。
// ほかのお店で買ったお客さんは数えない（そのお客さんは買えたので）。
export function missedCups(result: MonthResult, teamId: string): number {
  const me = result.teamResults.find((t) => t.teamId === teamId);
  if (!me || me.offered === 0 || me.sold < me.offered || me.price <= 0) return 0;
  return Math.floor(moneyFlow(result).unspent / me.price);
}

export type InsightId =
  | 'eliminated' // この月で脱落した
  | 'watching' // 静観した
  | 'noCups' // 仕入れたのに作れなかった
  | 'soldOutMissed' // 売り切れ。もっと作れば売れた
  | 'soldOut' // 売り切れ。ちょうどよかった
  | 'unsold' // 売れ残り
  | 'belowMaterial' // 値段が材料費より安い（売るほど損）
  | 'lossAfterWages' // 売れたのに、給料まで入れると赤字
  | 'idleBaristas' // バリスタが作れる数より、ずっと少なく作った
  | 'priceRank' // 何番目に安い値段だったか
  | 'marketUp' // お客さんのお金が先月より増えた
  | 'marketDown'; // 減った

export interface Insight {
  id: InsightId;
  params: Record<string, number>;
}

export interface MonthInsights {
  missed: number; // 売り逃した杯数（売り切れていなければ 0）
  flow: MoneyFlow;
  priceRank: number | null; // 売ったお店の中で、何番目に安いか（売っていなければ null）
  sellers: number; // 売ったお店の数
  materialPerCup: number;
  notes: Insight[]; // 大事な順。画面では先頭の数個を出す
}

// 市場の大きさが「変わった」と言う幅（10%）
const MARKET_CHANGE = 0.1;
// バリスタが作れる数の半分より少なければ「給料のむだ」と言う
const IDLE_RATE = 0.5;

export function monthInsights(
  result: MonthResult,
  teamId: string,
  recipe: Recipe,
  baristaCapacity: number,
  previous?: MonthResult,
): MonthInsights | null {
  const me = result.teamResults.find((t) => t.teamId === teamId);
  if (!me) return null;
  const flow = moneyFlow(result);
  const missed = missedCups(result, teamId);
  const materialPerCup = result.prices.lemon * recipe.lemon + result.prices.sugar * recipe.sugar;
  const sellers = result.teamResults.filter((t) => t.offered > 0);
  const priceRank = me.offered > 0 ? sellers.filter((t) => t.price < me.price).length + 1 : null;

  const notes: Insight[] = [];
  const add = (id: InsightId, params: Record<string, number> = {}) => notes.push({ id, params });

  if (me.eliminated) add('eliminated', { balance: me.balance });
  if (me.offered === 0) {
    const bought = me.lemonBought > 0 || me.sugarBought > 0;
    add(bought ? 'noCups' : 'watching', { wages: me.costBarista });
  } else {
    if (me.price < materialPerCup) add('belowMaterial', { price: me.price, material: materialPerCup });
    if (me.unsold > 0) {
      const cheapest = Math.min(...sellers.map((t) => t.price));
      add('unsold', { unsold: me.unsold, waste: me.unsold * materialPerCup, cheapest, price: me.price });
    } else if (missed > 0) {
      add('soldOutMissed', { missed, revenue: missed * me.price });
    } else {
      add('soldOut', { sold: me.sold });
    }
    if (me.profit < 0 && me.sold > 0 && me.price >= materialPerCup) add('lossAfterWages', { wages: me.costBarista, profit: me.profit });
    const capacity = me.baristaCount * baristaCapacity;
    if (capacity > 0 && me.offered < capacity * IDLE_RATE) add('idleBaristas', { capacity, made: me.offered, wages: me.costBarista });
    add('priceRank', { rank: priceRank!, sellers: sellers.length, price: me.price });
  }
  if (previous && previous.marketBudget > 0) {
    const change = (result.marketBudget - previous.marketBudget) / previous.marketBudget;
    const pct = Math.round(Math.abs(change) * 100);
    if (change >= MARKET_CHANGE) add('marketUp', { pct, budget: result.marketBudget });
    else if (change <= -MARKET_CHANGE) add('marketDown', { pct, budget: result.marketBudget });
  }
  return { missed, flow, priceRank, sellers: sellers.length, materialPerCup, notes };
}

// ---- 1年の振り返り（結果シート用） ----

// あなたの作戦のタイプ。ロボット店長の4つの作戦と同じ名前で、どれに近いかを見る
export type PlayStyle = 'discount' | 'premium' | 'follower' | 'cautious';
// 称号
export type TermTitle = 'master' | 'skilled' | 'rookie' | 'apprentice';

export type TermNoteId =
  // よかったところ
  | 'rankFirst' // 1位
  | 'survived' // 最後までお店を続けた
  | 'profit' // 1年でもうけを出した
  | 'bestMonth' // いちばんもうかった月
  | 'sellThrough' // 作った数をほとんど売り切った
  // 次に挑戦したいこと
  | 'eliminated' // 脱落した
  | 'unsold' // 売れ残りが多い
  | 'missed' // 売り逃しが多い
  | 'lossMonths' // 赤字の月があった
  | 'belowMaterial' // 材料費より安く売った月があった
  | 'idle' // バリスタの給料のむだがあった
  | 'noIssue'; // 大きな課題なし

export interface TermNote {
  id: TermNoteId;
  params: Record<string, number>; // 月は「期の何か月目」（画面で暦の月に直す）
}

export interface TermFeedback {
  style: PlayStyle;
  title: TermTitle;
  rank: number;
  teamCount: number;
  missedByMonth: Record<number, number>; // 月 → 売り逃した杯数
  totalMissed: number;
  good: TermNote[]; // 多くて3つ
  next: TermNote[]; // 多くて3つ
}

// 売れ残り・売り逃しが「多い」と言う割合（作った数・売れた数の15%）
const MANY_RATE = 0.15;

export function termFeedback(
  results: MonthResult[],
  teamId: string,
  recipe: Recipe,
  baristaCapacity: number,
  final: { rank: number; teamCount: number; eliminatedMonth?: number },
): TermFeedback {
  const mine = results
    .map((r) => ({ r, me: r.teamResults.find((t) => t.teamId === teamId) }))
    .filter((x): x is { r: MonthResult; me: NonNullable<typeof x.me> } => x.me !== undefined);

  const missedByMonth: Record<number, number> = {};
  let totalMissed = 0;
  let offered = 0;
  let sold = 0;
  let unsold = 0;
  let waste = 0;
  let profit = 0;
  const rankRatios: number[] = [];
  const loss: { month: number; profit: number }[] = [];
  let belowMaterial = 0;
  let idle = 0;
  let best: { month: number; profit: number } | null = null;

  for (const { r, me } of mine) {
    const materialPerCup = r.prices.lemon * recipe.lemon + r.prices.sugar * recipe.sugar;
    const m = missedCups(r, teamId);
    missedByMonth[r.month] = m;
    totalMissed += m;
    offered += me.offered;
    sold += me.sold;
    unsold += me.unsold;
    waste += me.unsold * materialPerCup;
    profit += me.profit;
    if (me.profit < 0) loss.push({ month: r.month, profit: me.profit });
    if (!best || me.profit > best.profit) best = { month: r.month, profit: me.profit };
    if (me.offered > 0) {
      const sellers = r.teamResults.filter((t) => t.offered > 0);
      const cheaper = sellers.filter((t) => t.price < me.price).length;
      rankRatios.push(sellers.length > 1 ? cheaper / (sellers.length - 1) : 0.5);
      if (me.price < materialPerCup) belowMaterial++;
      const capacity = me.baristaCount * baristaCapacity;
      if (capacity > 0 && me.offered < capacity * IDLE_RATE) idle++;
    }
  }

  // 作戦のタイプ：値段がまわりと比べて安いか高いか。真ん中なら、控えめに作ったか（売り切れて売り逃しが多い）で分ける
  const avgRatio = rankRatios.length > 0 ? rankRatios.reduce((a, b) => a + b, 0) / rankRatios.length : 0.5;
  const sellThrough = offered > 0 ? sold / offered : 0;
  const style: PlayStyle = avgRatio <= 0.25 ? 'discount'
    : avgRatio >= 0.75 ? 'premium'
    : sellThrough >= 0.95 && totalMissed > sold * 0.3 ? 'cautious'
    : 'follower';

  const title: TermTitle = profit < 0 || final.eliminatedMonth !== undefined ? 'apprentice'
    : final.rank === 1 ? 'master'
    : final.rank <= Math.ceil(final.teamCount / 2) ? 'skilled'
    : 'rookie';

  const good: TermNote[] = [];
  if (final.rank === 1 && final.eliminatedMonth === undefined) good.push({ id: 'rankFirst', params: { teams: final.teamCount } });
  if (final.eliminatedMonth === undefined) good.push({ id: 'survived', params: { months: mine.length } });
  if (profit > 0) good.push({ id: 'profit', params: { profit } });
  if (offered > 0 && sellThrough >= 0.9) good.push({ id: 'sellThrough', params: { pct: Math.round(sellThrough * 100) } });
  if (best && best.profit > 0) good.push({ id: 'bestMonth', params: { month: best.month, profit: best.profit } });

  const next: TermNote[] = [];
  if (final.eliminatedMonth !== undefined) next.push({ id: 'eliminated', params: { month: final.eliminatedMonth } });
  if (belowMaterial > 0) next.push({ id: 'belowMaterial', params: { count: belowMaterial } });
  if (offered > 0 && unsold / offered >= MANY_RATE) next.push({ id: 'unsold', params: { cups: unsold, waste } });
  if (totalMissed >= 20 && totalMissed >= sold * MANY_RATE) {
    const avgPrice = sold > 0 ? mine.reduce((a, x) => a + x.me.revenue, 0) / sold : 0;
    next.push({ id: 'missed', params: { cups: totalMissed, revenue: Math.round((totalMissed * avgPrice) / 100) * 100 } });
  }
  if (loss.length > 0) {
    const worst = loss.reduce((w, x) => (x.profit < w.profit ? x : w));
    next.push({ id: 'lossMonths', params: { count: loss.length, month: worst.month, profit: worst.profit } });
  }
  if (idle > 0) next.push({ id: 'idle', params: { count: idle } });
  if (next.length === 0) next.push({ id: 'noIssue', params: {} });

  return {
    style, title, rank: final.rank, teamCount: final.teamCount, missedByMonth, totalMissed,
    good: good.slice(0, 3), next: next.slice(0, 3),
  };
}
