// CPU チームの意思決定（初級ルール）。純粋関数。
// 初級はお客さんが「安い店から順に買う」だけなので、値段と仕入れの量で作戦の違いを出す。
// CPU が見てよい情報は CpuView だけ（今月の市場予算は見ない）。
// dice は CPU ごとのサイコロ（0 以上 1 未満）。同じ dice なら同じ決定になる。

import { canChangeBarista } from './config';
import type { BaristaCadence, CpuDecision, CpuSkill, CpuType, CpuView, MonthResult, Recipe, TeamState, UnitPrices } from './types';

export const CPU_TYPES: CpuType[] = ['discount', 'premium', 'follower', 'cautious'];

// 期末の答え合わせで見せる名前と説明
export const CPU_TYPE_INFO: Record<CpuType, { label: string; description: string }> = {
  discount: { label: '安売り', description: '先月いちばん安かった店より少し安くして、たくさん作って売る。' },
  premium: { label: '高値', description: '1杯の原価の2倍くらいの高い値段で、少しだけ売る。' },
  follower: { label: '追随', description: '先月売り切れた店の値段にそろえ、先月の市場の大きさから売れる数を見込む。' },
  cautious: { label: '慎重', description: 'ほどほどの値段で、先月売れた数だけ作る。お金が減ったら休む（静観）。' },
};

// CPU に見せる情報を組み立てる。結果は締め切った月（今月より前）のものだけを渡す。
export function cpuViewOf(input: {
  month: number;
  prices: UnitPrices;
  rules: CpuView['rules'];
  me: TeamState;
  results: MonthResult[];
  baristaCadence?: BaristaCadence;
}): CpuView {
  return {
    month: input.month,
    quarterStart: canChangeBarista(input.month, input.baristaCadence),
    prices: { ...input.prices },
    rules: input.rules,
    me: input.me,
    history: input.results.filter((r) => r.month < input.month),
  };
}

export function decideCpu(
  type: CpuType,
  view: CpuView,
  dice: (k: number) => number,
  skill: CpuSkill = 'basic',
): CpuDecision {
  const plan = (skill === 'adaptive' ? ADAPTIVE_PLANNERS : PLANNERS)[type](view, dice);
  const barista = view.quarterStart ? plan.barista : view.me.baristaCount;
  if (plan.watch) {
    return withQuarter(view, barista, { lemonQty: 0, sugarQty: 0, price: 0, watching: true });
  }
  const price = Math.max(10, roundTo10(plan.price));
  const cups = Math.max(0, Math.min(Math.floor(plan.cups), barista * view.rules.baristaCapacity));
  const { lemonQty, sugarQty } = purchaseFor(cups, view.me, view.rules.recipe);
  return withQuarter(view, barista, { lemonQty, sugarQty, price });
}

// ---- 作戦ごとの考え方 ----

interface Plan {
  price: number;
  cups: number; // 作って売るつもりの杯数
  barista: number; // 四半期の最初の月に決める人数
  watch?: boolean;
}

const PLANNERS: Record<CpuType, (v: CpuView, dice: (k: number) => number) => Plan> = {
  // 安売り：先月いちばん安かった店より10円安く（ただし1杯の原価は下回らない）。たくさん作る
  discount(v, dice) {
    const barista = 2;
    const floor = Math.ceil(cupCost(v, barista) / 10) * 10;
    const last = lastResult(v);
    const lowest = last ? minPrice(last, v.me.teamId) : null;
    const price = lowest !== null ? Math.max(floor, lowest - 10) : 200 + jitter(dice, 1, 20);
    return { price, cups: capacityOf(v, barista), barista };
  },

  // 高値：1杯の原価の2倍前後。少なめに作り、売り切れたら少し増やす
  premium(v, dice) {
    const barista = 1;
    const price = cupCost(v, barista) * 2.2 + jitter(dice, 1, 20);
    const mine = myLastResult(v);
    const cups = !mine ? 30 : mine.offered > 0 && mine.sold >= mine.offered ? mine.offered + 10 : Math.max(10, mine.sold);
    return { price, cups, barista };
  },

  // 追随：先月売り切れた店の値段の真ん中にそろえる。先月の市場の大きさから売れる数を見込む
  follower(v, dice) {
    const last = lastResult(v);
    if (!last) return { price: 280 + jitter(dice, 1, 20), cups: 50, barista: 1 };
    const soldOut = last.teamResults.filter((t) => t.offered > 0 && t.sold >= t.offered).map((t) => t.price);
    const offered = last.teamResults.filter((t) => t.offered > 0).map((t) => t.price);
    const ref = soldOut.length > 0 ? median(soldOut) : offered.length > 0 ? median(offered) - 10 : 280;
    const price = Math.max(ref, Math.ceil(cupCost(v, 1) / 10) * 10);
    const expected = last.marketBudget / v.rules.teamCount / price;
    const barista = Math.min(3, Math.max(1, Math.ceil(expected / v.rules.baristaCapacity)));
    return { price, cups: expected, barista };
  },

  // 慎重：原価の1.6倍くらい。先月売れた数だけ作る。お金が1か月分の費用を下回ったら静観
  cautious(v, dice) {
    const barista = 1;
    const price = cupCost(v, barista) * 1.6 + jitter(dice, 1, 10);
    const mine = myLastResult(v);
    const cups = !mine ? 30 : mine.offered > 0 && mine.sold >= mine.offered ? mine.sold + 5 : mine.sold;
    const monthlyCost = v.prices.barista * v.me.baristaCount + cups * materialCost(v.prices, v.rules.recipe);
    return { price, cups, barista, watch: v.me.balance < monthlyCost };
  },
};

// ---- 手強い CPU（先月の結果を見て調整する） ----
// 見るのは先月の結果だけ：自分が売り切れたか、市場のお金が余ったか、ほかの店の値段。

const ADAPTIVE_PLANNERS: Record<CpuType, (v: CpuView, dice: (k: number) => number) => Plan> = {
  // 安売り：いちばん安い店より10円安く。売れ残ったら作る量を減らす（バリスタは2人まで）
  discount(v, dice) {
    const base = PLANNERS.discount(v, dice);
    const mine = myLastResult(v);
    const barista = mine && mine.offered - mine.sold > 20 ? 1 : 2;
    const cups = mine && mine.offered > mine.sold ? mine.sold + 10 : capacityOf(v, barista);
    return { ...base, barista, cups };
  },

  // 高値：売り切れたら値上げ、売れ残ったら値下げ（原価の1.3倍は下回らない）
  premium(v, dice) {
    const mine = myLastResult(v);
    const floor = cupCost(v, 1) * 1.3;
    if (!mine || mine.offered === 0) return PLANNERS.premium(v, dice);
    const price = mine.sold >= mine.offered ? mine.price + 20 : Math.max(floor, mine.price * 0.9);
    const cups = mine.sold >= mine.offered ? mine.offered + 10 : Math.max(10, mine.sold);
    return { price, cups, barista: cups > v.rules.baristaCapacity ? 2 : 1 };
  },

  // 追随：売り切れた店の値段にそろえ、市場のお金が余っていたら少し高く、多めに作る
  follower(v, dice) {
    const base = PLANNERS.follower(v, dice);
    const last = lastResult(v);
    if (!last) return base;
    const room = marketRoom(v);
    const price = room > 0 ? base.price + 10 : base.price;
    const expected = (last.marketBudget / v.rules.teamCount / price) * (room > 0 ? 1.3 : 1);
    const barista = Math.min(3, Math.max(1, Math.ceil(expected / v.rules.baristaCapacity)));
    return { price, cups: expected, barista };
  },

  // 慎重：売り切れたら少し値上げ、売れ残ったら少し値下げ。売り切れて市場のお金が余っていたらバリスタを2人に
  cautious(v, dice) {
    const base = PLANNERS.cautious(v, dice);
    const mine = myLastResult(v);
    if (!mine || mine.offered === 0) return base;
    const soldOut = mine.sold >= mine.offered;
    const barista = soldOut && marketRoom(v) > 0 ? 2 : 1;
    const price = soldOut ? mine.price + 10 : mine.price - 10;
    return { ...base, barista, price: Math.max(cupCost(v, barista) * 1.2, price), cups: soldOut ? mine.sold + 10 : mine.sold };
  },
};

// 先月、市場のお金がどれだけ余ったか（使われなかった額）
function marketRoom(v: CpuView): number {
  const last = lastResult(v);
  if (!last) return 0;
  return last.marketBudget - last.teamResults.reduce((a, t) => a + t.revenue, 0);
}

// ---- 計算の部品 ----

// 1杯の材料費
function materialCost(prices: UnitPrices, recipe: Recipe): number {
  return prices.lemon * recipe.lemon + prices.sugar * recipe.sugar;
}

// 1杯の原価（材料費＋バリスタが上限まで作ったときの1杯あたりの給料）
function cupCost(v: CpuView, barista: number): number {
  const labor = barista > 0 ? v.prices.barista / v.rules.baristaCapacity : 0;
  return materialCost(v.prices, v.rules.recipe) + labor;
}

function capacityOf(v: CpuView, barista: number): number {
  return barista * v.rules.baristaCapacity;
}

// cups 杯を作るのに足りない分だけ買う（在庫を先に使う）
function purchaseFor(cups: number, me: TeamState, recipe: Recipe): { lemonQty: number; sugarQty: number } {
  return {
    lemonQty: Math.max(0, cups * recipe.lemon - me.stock.lemon),
    sugarQty: Math.max(0, cups * recipe.sugar - me.stock.sugar),
  };
}

function lastResult(v: CpuView): MonthResult | null {
  return v.history.length > 0 ? v.history[v.history.length - 1]! : null;
}

function myLastResult(v: CpuView) {
  return lastResult(v)?.teamResults.find((t) => t.teamId === v.me.teamId) ?? null;
}

// 先月、ほかの店が出した値段のうちいちばん安いもの（出した店がなければ null）
function minPrice(r: MonthResult, myId: string): number | null {
  const prices = r.teamResults.filter((t) => t.teamId !== myId && t.offered > 0).map((t) => t.price);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

// ±width のゆらぎ
function jitter(dice: (k: number) => number, k: number, width: number): number {
  return (dice(k) * 2 - 1) * width;
}

function roundTo10(x: number): number {
  return Math.round(x / 10) * 10;
}

function withQuarter(v: CpuView, barista: number, monthlyDecision: CpuDecision['monthlyDecision']): CpuDecision {
  return v.quarterStart ? { monthlyDecision, quarterlyDecision: { baristaCount: barista } } : { monthlyDecision };
}
