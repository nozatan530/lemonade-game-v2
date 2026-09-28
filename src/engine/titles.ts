// 肩書き：1年ごとに、その年の遊び方に合わせてつく（ゲームの実績のようなもの）。
// 条件はすべて結果の数字から決める。文（名前・説明）は画面が辞書から出す。

import { missedCups } from './feedback';
import { rankTeams } from './month';
import type { MonthResult, Recipe, TeamState } from './types';

// 表示するときの順番（目立つ順）。画面では先頭から3つまで出す
export const TITLE_IDS = [
  'champion', // 👑 市場の覇者
  'neverRed', // 🟢 無敗の店長
  'priceCrusher', // ⚔️ 価格破壊王
  'lastStanding', // 🛡️ 最後の砦
  'underdog', // 🏔️ 下剋上
  'risingFast', // 🚀 急成長店長
  'steadyHand', // 🧱 安定経営
  'comeback', // 📈 V字回復店長
  'forecaster', // 🎯 読みの達人
  'zeroWaste', // ♻️ エコ店長
  'premium', // 💎 高級路線の店長
  'volumeSeller', // 📦 薄利多売の達人
  'customerFriend', // 🛒 お客さんの味方
  'soldOutStar', // 🔥 売り切れ御免
  'teamMaster', // 🧑‍🍳 人使いの名人
  'careful', // 🧘 慎重派
  'neverGiveUp', // 🌧️ 七転び八起き
  'lemonHoarder', // 🍋 レモン長者
  'tooGenerous', // 💸 大盤振る舞い
  'apprentice', // 🍋 見習い店長（ほかに何もつかなかった年）
] as const;
export type TitleId = (typeof TITLE_IDS)[number];

export const TITLE_EMOJI: Record<TitleId, string> = {
  champion: '👑', neverRed: '🟢', priceCrusher: '⚔️', lastStanding: '🛡️', underdog: '🏔️', risingFast: '🚀',
  steadyHand: '🧱', comeback: '📈', forecaster: '🎯', zeroWaste: '♻️', premium: '💎', volumeSeller: '📦',
  customerFriend: '🛒', soldOutStar: '🔥', teamMaster: '🧑‍🍳', careful: '🧘', neverGiveUp: '🌧️',
  lemonHoarder: '🍋', tooGenerous: '💸', apprentice: '🍋',
};

// 画面に出す肩書きの数
export const SHOWN_TITLES = 3;

export interface YearTitleInput {
  results: MonthResult[]; // その年の月の結果（全店）
  meId: string;
  recipe: Recipe;
  baristaCapacity: number;
  elimination: boolean; // 脱落あり
  endStandings: TeamState[]; // その年の終わりの各お店（資金・脱落）
  history: { profit: number; rank: number }[]; // 前の年までの自分（古い順）。1年目は空
}

// その年につく肩書き（表示の順）。何もなければ「見習い店長」だけ
export function yearTitles(input: YearTitleInput): TitleId[] {
  const { results, meId } = input;
  const got = new Set<TitleId>();
  const mine = results
    .map((r) => ({ r, me: r.teamResults.find((t) => t.teamId === meId) }))
    .filter((x): x is { r: MonthResult; me: NonNullable<typeof x.me> } => x.me !== undefined);
  if (mine.length === 0) return ['apprentice'];

  const fullYear = mine.length === 12;
  const material = (r: MonthResult) => r.prices.lemon * input.recipe.lemon + r.prices.sugar * input.recipe.sugar;
  const profit = mine.reduce((a, x) => a + x.me.profit, 0);
  const offered = mine.reduce((a, x) => a + x.me.offered, 0);
  const sold = mine.reduce((a, x) => a + x.me.sold, 0);
  const unsold = mine.reduce((a, x) => a + x.me.unsold, 0);
  const missed = mine.reduce((a, x) => a + missedCups(x.r, meId), 0);
  const lossMonths = mine.filter((x) => x.me.profit < 0).length;
  const selling = mine.filter((x) => x.me.offered > 0);

  const ranked = rankTeams(input.endStandings);
  const rank = ranked.findIndex((t) => t.teamId === meId) + 1;
  const meEnd = ranked.find((t) => t.teamId === meId)!;
  const survived = meEnd.eliminatedMonth === undefined;

  // お店ごとの、その年の合計
  const byTeam = new Map<string, { sold: number; profit: number; unsold: number; offered: number; priceSum: number; priceMonths: number }>();
  for (const r of results) {
    for (const t of r.teamResults) {
      const s = byTeam.get(t.teamId) ?? { sold: 0, profit: 0, unsold: 0, offered: 0, priceSum: 0, priceMonths: 0 };
      s.sold += t.sold; s.profit += t.profit; s.unsold += t.unsold; s.offered += t.offered;
      if (t.offered > 0) { s.priceSum += t.price; s.priceMonths++; }
      byTeam.set(t.teamId, s);
    }
  }
  const others = [...byTeam.entries()].filter(([id]) => id !== meId).map(([, s]) => s);
  const my = byTeam.get(meId)!;
  const avgPrice = (s: typeof my) => (s.priceMonths > 0 ? s.priceSum / s.priceMonths : null);
  const perCup = (s: typeof my) => (s.sold > 0 ? s.profit / s.sold : null);

  // 👑 市場の覇者：1位で、2位との差が資金の2割以上
  if (rank === 1 && survived && ranked.length > 1 && meEnd.balance > 0 && meEnd.balance - ranked[1]!.balance >= meEnd.balance * 0.2) got.add('champion');
  // 🟢 無敗の店長：12か月すべて黒字
  if (fullYear && mine.every((x) => x.me.profit > 0)) got.add('neverRed');
  // ⚔️ 価格破壊王：ほかのお店が脱落した月に、いちばん安い値段で売っていた
  if (input.elimination && mine.some((x) => x.me.offered > 0
    && x.r.teamResults.some((t) => t.teamId !== meId && t.eliminated)
    && x.r.teamResults.every((t) => t.teamId === meId || t.offered === 0 || t.price >= x.me.price))) got.add('priceCrusher');
  // 🛡️ 最後の砦：残りが2店以下になっても生き残った（3店以上で始めたとき）
  if (input.elimination && survived && input.endStandings.length >= 3
    && input.endStandings.filter((t) => t.eliminatedMonth === undefined).length <= 2) got.add('lastStanding');
  // 🏔️ 下剋上：順位が前の年より2つ以上上がった
  const prev = input.history[input.history.length - 1];
  if (prev && prev.rank - rank >= 2) got.add('underdog');
  // 🚀 急成長店長：もうけが前の年の1.5倍以上
  if (prev && prev.profit > 0 && profit >= prev.profit * 1.5) got.add('risingFast');
  // 🧱 安定経営：3年以上続けて黒字
  if (input.history.length >= 2 && profit > 0 && input.history.slice(-2).every((h) => h.profit > 0)) got.add('steadyHand');
  // 📈 V字回復店長：前半6か月は赤字、後半6か月は黒字
  if (fullYear) {
    const first = mine.slice(0, 6).reduce((a, x) => a + x.me.profit, 0);
    const second = mine.slice(6).reduce((a, x) => a + x.me.profit, 0);
    if (first < 0 && second > 0) got.add('comeback');
  }
  // 🎯 読みの達人：売れた割合95%以上で、売り逃しも売れた数の5%以下
  if (sold > 0 && sold / offered >= 0.95 && missed <= sold * 0.05) got.add('forecaster');
  // ♻️ エコ店長：売れ残り0杯
  if (sold > 0 && unsold === 0) got.add('zeroWaste');
  // 💎 高級路線の店長：平均の値段がいちばん高いのに黒字で、順位も上半分
  const myAvg = avgPrice(my);
  if (myAvg !== null && profit > 0 && rank <= Math.ceil(ranked.length / 2) && others.every((s) => { const a = avgPrice(s); return a === null || a < myAvg; })) got.add('premium');
  // 📦 薄利多売の達人：売った杯数がいちばん多く、1杯あたりのもうけは真ん中より下
  const sellers = [...byTeam.values()].filter((s) => s.sold > 0);
  const cups = sellers.map((s) => perCup(s)!).sort((a, b) => a - b);
  const median = cups.length > 0 ? cups[Math.floor((cups.length - 1) / 2)]! : 0;
  if (sold > 0 && others.every((s) => s.sold < sold) && perCup(my)! <= median) got.add('volumeSeller');
  // 🛒 お客さんの味方：12か月ずっといちばん安い値段（同じ値段もふくむ）
  if (fullYear && selling.length === 12 && selling.every((x) => x.r.teamResults.every((t) => t.teamId === meId || t.offered === 0 || t.price >= x.me.price))) got.add('customerFriend');
  // 🔥 売り切れ御免：9か月以上で売り切れ
  if (selling.filter((x) => x.me.unsold === 0).length >= 9) got.add('soldOutStar');
  // 🧑‍🍳 人使いの名人：毎月、バリスタが作れる数の9割以上を作り、半分以上の月はバリスタ2人以上
  if (fullYear && selling.length === 12
    && selling.every((x) => x.me.baristaCount > 0 && x.me.offered >= x.me.baristaCount * input.baristaCapacity * 0.9)
    && selling.filter((x) => x.me.baristaCount >= 2).length >= 6) got.add('teamMaster');
  // 🧘 慎重派：静観した月があり、赤字の月は1回まで
  const watched = mine.some((x) => x.me.offered === 0 && x.me.lemonBought === 0 && x.me.sugarBought === 0);
  if (watched && lossMonths <= 1 && survived) got.add('careful');
  // 🌧️ 七転び八起き：赤字の月が6回以上なのに、最後まで続けた
  if (fullYear && survived && lossMonths >= 6) got.add('neverGiveUp');
  // 🍋 レモン長者：売れ残りがいちばん多く、作った数の3割以上
  if (offered > 0 && unsold >= offered * 0.3 && others.every((s) => s.unsold < unsold)) got.add('lemonHoarder');
  // 💸 大盤振る舞い：材料費より安い値段で売った月が3回以上
  if (selling.filter((x) => x.me.price < material(x.r)).length >= 3) got.add('tooGenerous');

  if (got.size === 0) got.add('apprentice');
  return TITLE_IDS.filter((id) => got.has(id));
}
