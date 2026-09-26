// ソロモードのバランスを確かめるためのシミュレーション（テストから使う）。
// 人のかわりに、決まった考え方で遊ぶ「お手本の遊び方」を動かす。

import { canChangeBarista } from '../engine/config';
import type { MarketPattern, MonthlyDecision } from '../engine/types';
import { HUMAN_ID, newSoloGame, nextSoloMonth, submitHuman, type SoloDifficulty, type SoloState } from './local-game';

export type Player = (s: SoloState) => { decision: MonthlyDecision; barista: number };

// 何も考えずに押し続ける（入力画面の既定値のまま）
export const clicker: Player = () => ({ decision: { lemonQty: 50, sugarQty: 50, price: 300 }, barista: 1 });

// 考えて遊ぶ：先月の結果を見て、値段とバリスタの人数を変える
//   値段：売り切れたら20円上げる／売れ残ったら30円下げる（150円は下回らない）
//   バリスタ（3か月ごと）：売り切れて市場のお金が余っていたら1人増やす／20杯以上売れ残ったら1人減らす（1〜3人）
//   仕入れ：作れる上限の分だけ（在庫があれば差し引く）
export const thinker: Player = (s) => {
  const me = s.teams.find((t) => t.teamId === HUMAN_ID)!;
  const last = s.results[s.results.length - 1];
  const mine = last?.teamResults.find((t) => t.teamId === HUMAN_ID);
  let price = s.decided[HUMAN_ID]?.price || 250;
  let barista = me.baristaCount;
  if (mine && mine.offered > 0) {
    const soldOut = mine.sold >= mine.offered;
    price = soldOut ? price + 20 : Math.max(150, price - 30);
    if (canChangeBarista(s.conditions.month, s.config.baristaCadence)) {
      const room = last!.marketBudget - last!.teamResults.reduce((a, t) => a + t.revenue, 0);
      if (soldOut && room > 0) barista = Math.min(3, barista + 1);
      else if (mine.offered - mine.sold >= 20) barista = Math.max(1, barista - 1);
    }
  }
  const cups = barista * s.config.baristaCapacity;
  return {
    decision: {
      lemonQty: Math.max(0, cups * s.config.recipe.lemon - me.stock.lemon),
      sugarQty: Math.max(0, cups * s.config.recipe.sugar - me.stock.sugar),
      price,
    },
    barista,
  };
};

// よく考えて遊ぶ：先月いちばん安かったライバルより少し安くして、バリスタを増やしてたくさん売る。
//   値段：ライバルの最安値 − 10円（1杯の原価＋40円は下回らない）
//   バリスタ（決められる月に）：最初は3人。20杯以上売れ残ったら1人減らし、売り切れて市場のお金が余っていたら1人増やす（1〜4人）
export const undercutter: Player = (s) => {
  const me = s.teams.find((t) => t.teamId === HUMAN_ID)!;
  const last = s.results[s.results.length - 1];
  const mine = last?.teamResults.find((t) => t.teamId === HUMAN_ID);
  const p = s.conditions.prices;
  const cupCost = p.lemon * s.config.recipe.lemon + p.sugar * s.config.recipe.sugar + p.barista / s.config.baristaCapacity;
  const rivals = last?.teamResults.filter((t) => t.teamId !== HUMAN_ID && t.offered > 0).map((t) => t.price) ?? [];
  const price = rivals.length > 0 ? Math.max(Math.ceil((cupCost + 40) / 10) * 10, Math.min(...rivals) - 10) : 220;
  let barista = me.baristaCount;
  if (canChangeBarista(s.conditions.month, s.config.baristaCadence)) {
    const room = last ? last.marketBudget - last.teamResults.reduce((a, t) => a + t.revenue, 0) : 0;
    barista = !mine ? 3
      : mine.offered - mine.sold >= 20 ? Math.max(1, barista - 1)
      : mine.sold >= mine.offered && room > 0 ? Math.min(4, barista + 1)
      : barista;
  }
  const cups = barista * s.config.baristaCapacity;
  return {
    decision: {
      lemonQty: Math.max(0, cups * s.config.recipe.lemon - me.stock.lemon),
      sugarQty: Math.max(0, cups * s.config.recipe.sugar - me.stock.sugar),
      price,
    },
    barista,
  };
};

export function playSolo(
  player: Player,
  options: { seed: string; difficulty: SoloDifficulty; pattern?: MarketPattern },
): { rank: number; state: SoloState } {
  let s = newSoloGame({ seed: options.seed, difficulty: options.difficulty, pattern: options.pattern ?? 'stable' });
  while (s.phase !== 'final') {
    if (s.phase === 'input') {
      const { decision, barista } = player(s);
      s = submitHuman(s, decision, barista);
    } else {
      s = nextSoloMonth(s);
    }
  }
  const ranked = [...s.teams].sort((a, b) => b.balance - a.balance);
  return { rank: ranked.findIndex((t) => t.teamId === HUMAN_ID) + 1, state: s };
}

// n 回遊んで、1位になった割合と順位の分布を返す
export function winRate(
  player: Player,
  difficulty: SoloDifficulty,
  n: number,
  pattern: MarketPattern = 'stable',
): { firstRate: number; ranks: number[] } {
  const ranks = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) ranks[playSolo(player, { seed: `balance-${i}`, difficulty, pattern }).rank - 1]!++;
  return { firstRate: ranks[0]! / n, ranks };
}
