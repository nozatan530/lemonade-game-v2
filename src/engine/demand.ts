// 市場予算と、その月の原価。初級は旧版と同じ仕組み（価格重視層のみ）。

import { monthRandom, seededRand, type SeededRand } from './random';
import { SCENARIOS } from './scenarios';
import type { GameConfig, MonthConditions, UnitPrices } from './types';

interface AutoValues {
  marketBudget: number;
  prices: UnitPrices;
}

// シナリオなしのときの市場予算と原価（旧版の calcNextMonthValues）。
// 原価の変動は常に初期値を基準に計算する（前月を基準にすると際限なく下がるため）。
// rand は旧版との比較テストで旧版の乱数を渡すためのもの。ゲームでは既定の seededRand を使う。
export function autoMonthValues(month: number, config: GameConfig, rand: SeededRand = seededRand): AutoValues {
  const M = config.market;
  const r = monthRandom(M.seed, month, rand);
  const marketVariance = ((r(1) * 2 - 1) * M.range) / 100;
  const marketBudget = Math.round((M.base * (1 + marketVariance)) / 1000) * 1000;

  const IC = config.initialPrices;
  let lemon = IC.lemon, sugar = IC.sugar, barista = IC.barista;
  const cr = M.costRange / 100;
  if (M.costMode === 'random') {
    // 初期値 ± 変動幅の範囲でランダム
    lemon = Math.max(10, Math.round(IC.lemon * (1 + (r(2) * 2 - 1) * cr)));
    sugar = Math.max(5, Math.round(IC.sugar * (1 + (r(3) * 2 - 1) * cr)));
    barista = Math.max(500, Math.round(IC.barista * (1 + ((r(4) * 2 - 1) * cr) / 2)));
  } else if (M.costMode === 'trend') {
    // 月が進むにつれ上昇＋小さなランダム
    const trend = 1 + (month - 1) * 0.03;
    lemon = Math.max(10, Math.round(IC.lemon * trend * (1 + (r(2) * 2 - 1) * cr * 0.3)));
    sugar = Math.max(5, Math.round(IC.sugar * trend * (1 + (r(3) * 2 - 1) * cr * 0.3)));
    barista = Math.max(500, Math.round(IC.barista * (1 + (r(4) * 2 - 1) * cr * 0.2)));
  } else if (M.costMode === 'shock') {
    // ふだんは小さな変動、ときどき大きなショック
    const isShock = r(5) < 0.25;
    const mult = isShock ? 1 + (r(6) > 0.5 ? 1 : -1) * cr : 1 + (r(2) * 2 - 1) * cr * 0.2;
    lemon = Math.max(10, Math.round(IC.lemon * mult));
    sugar = Math.max(5, Math.round(IC.sugar * (isShock ? mult : 1 + (r(3) * 2 - 1) * cr * 0.1)));
    barista = Math.max(500, Math.round(IC.barista));
  }
  return { marketBudget, prices: { lemon, sugar, barista } };
}

// シナリオのある月の値（旧版の getScenarioMonth）。
// シナリオの market は2チーム基準なので、チーム数に比例して拡大する。
export function scenarioMonthValues(
  month: number,
  config: GameConfig,
  teamCount: number,
): (AutoValues & { message: string }) | null {
  if (config.scenario === 'none') return null;
  const sm = SCENARIOS[config.scenario].months[month - 1];
  if (!sm) return null;
  const IC = config.initialPrices;
  const n = teamCount || 2;
  return {
    marketBudget: Math.round((sm.market * n) / 2 / 1000) * 1000,
    prices: {
      lemon: Math.round(IC.lemon * sm.lemonMult),
      sugar: Math.round(IC.sugar * sm.sugarMult),
      barista: Math.round(IC.barista * sm.baristaMult),
    },
    message: sm.msg,
  };
}

// その月の市場の条件（GM が手入力で上書きする前の値）。
// 旧版の進行と同じ優先順位：シナリオ ＞ 自動変動 ＞ 前月の単価。
// - 1か月目は、シナリオがあっても初期単価と自動の市場予算を使う（旧版の動作）
// - 原価が fixed でシナリオもないときは、前月の単価を引き継ぐ（GM の上書きが残る）
export function monthConditions(
  month: number,
  config: GameConfig,
  teamCount: number,
  prevPrices: UnitPrices,
  rand: SeededRand = seededRand,
): MonthConditions {
  const auto = autoMonthValues(month, config, rand);
  if (month === 1) {
    return { month, marketBudget: auto.marketBudget, prices: { ...config.initialPrices } };
  }
  const scenario = scenarioMonthValues(month, config, teamCount);
  if (scenario) {
    return { month, marketBudget: scenario.marketBudget, prices: scenario.prices, message: scenario.message };
  }
  const prices = config.market.costMode === 'fixed' ? { ...prevPrices } : auto.prices;
  return { month, marketBudget: auto.marketBudget, prices };
}
