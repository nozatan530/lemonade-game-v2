// 販売チームが入力中に見る見込み。実際の結果（month.ts）と同じ関数で計算する。

import { purchaseBasisCosts, type MonthlyCosts } from './accounting';
import { offeredCups, productionCapacity, sanitizeDecision, type Capacity } from './inventory';
import type { GameConfig, MonthlyDecision, Stock, UnitPrices } from './types';

export type Bottleneck = 'lemon' | 'sugar' | 'barista' | null;

export interface DecisionPreview {
  capacity: Capacity;
  bottleneck: Bottleneck; // 作れる杯数を決めているもの（null = ちょうど釣り合っている）
  offered: number; // 市場に出す杯数
  costs: MonthlyCosts; // この月にかかるお金（仕入れ＋人件費）
  revenueIfSoldOut: number; // 全部売れたときの売上
  profitIfSoldOut: number; // 全部売れたときの利益
  leftover: Stock; // 市場に出さずに残る材料（翌月へ繰り越す）

  // 1杯あたり（円未満は四捨五入）。店に出さないときは null
  materialPerCup: number; // 1杯の材料費（レシピ × 単価）
  laborPerCup: number | null; // 1杯あたりの給料（給料 ÷ 実際に作る杯数）
  costPerCup: number | null; // 1杯あたりの原価（材料費＋給料）
  marginPerCup: number | null; // 1杯売ったときのもうけ（値段 − 1杯あたりの原価）

  // 元がとれる数：今月の支出を売上で取り戻すのに必要な杯数（支出 ÷ 値段、切り上げ）
  breakEvenCups: number | null;
  breakEvenReachable: boolean; // 店に出す数で元がとれるか

  // 月末の資金の見込み（売れた数しだいで、この間のどこかになる）
  balanceIfNoneSold: number; // 1杯も売れなかったら
  balanceIfSoldOut: number; // 全部売れたら
}

export function previewDecision(
  stock: Stock,
  decision: MonthlyDecision,
  baristaCount: number,
  prices: UnitPrices,
  config: Pick<GameConfig, 'baristaCapacity' | 'recipe'>,
  balance = 0, // いまの資金
): DecisionPreview {
  const d = sanitizeDecision(decision);
  const capacity = productionCapacity(stock, d.lemonQty, d.sugarQty, baristaCount, config);
  const offered = offeredCups(d, capacity);
  const costs = purchaseBasisCosts(d.lemonQty, d.sugarQty, baristaCount, prices);
  const revenueIfSoldOut = offered * d.price;

  // 作れる杯数を決めているもの。材料とバリスタがちょうど釣り合っているときは null
  let bottleneck: Bottleneck = null;
  if (capacity.capBarista < capacity.capIngredient) bottleneck = 'barista';
  else if (capacity.capIngredient < capacity.capBarista) bottleneck = capacity.capLemon <= capacity.capSugar ? 'lemon' : 'sugar';

  const materialPerCup = prices.lemon * config.recipe.lemon + prices.sugar * config.recipe.sugar;
  const laborPerCup = offered > 0 ? Math.round(costs.costBarista / offered) : null;
  const costPerCup = laborPerCup !== null ? materialPerCup + laborPerCup : null;
  const marginPerCup = costPerCup !== null ? d.price - costPerCup : null;
  const breakEvenCups = offered > 0 && d.price > 0 ? Math.ceil(costs.totalCost / d.price) : null;

  return {
    capacity,
    bottleneck,
    offered,
    costs,
    revenueIfSoldOut,
    profitIfSoldOut: revenueIfSoldOut - costs.totalCost,
    leftover: {
      lemon: Math.max(0, stock.lemon + d.lemonQty - offered * config.recipe.lemon),
      sugar: Math.max(0, stock.sugar + d.sugarQty - offered * config.recipe.sugar),
    },
    materialPerCup,
    laborPerCup,
    costPerCup,
    marginPerCup,
    breakEvenCups,
    breakEvenReachable: breakEvenCups !== null && breakEvenCups <= offered,
    balanceIfNoneSold: balance - costs.totalCost,
    balanceIfSoldOut: balance - costs.totalCost + revenueIfSoldOut,
  };
}
