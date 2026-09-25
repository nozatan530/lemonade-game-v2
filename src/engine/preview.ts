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
}

export function previewDecision(
  stock: Stock,
  decision: MonthlyDecision,
  baristaCount: number,
  prices: UnitPrices,
  config: Pick<GameConfig, 'baristaCapacity' | 'recipe'>,
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
  };
}
