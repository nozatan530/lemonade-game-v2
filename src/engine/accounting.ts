// 月次の損益。
// 初級は旧版と同じく「仕入れた分」をその月の原価にする（繰り越す在庫の分も、買った月の費用になる）。
// 「使った分」を原価にする方式は中級以上で導入する（docs/decisions.md 参照）。

import type { UnitPrices } from './types';

export interface MonthlyCosts {
  costLemon: number;
  costSugar: number;
  costBarista: number; // 人件費
  totalCost: number;
}

export function purchaseBasisCosts(
  lemonQty: number,
  sugarQty: number,
  baristaCount: number,
  prices: UnitPrices,
): MonthlyCosts {
  const costLemon = lemonQty * prices.lemon;
  const costSugar = sugarQty * prices.sugar;
  const costBarista = baristaCount * prices.barista;
  return { costLemon, costSugar, costBarista, totalCost: costLemon + costSugar + costBarista };
}
