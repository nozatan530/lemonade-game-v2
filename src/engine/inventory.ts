// 作れる杯数と在庫の繰り越し。

import type { GameConfig, MonthlyDecision, Stock } from './types';

export interface Capacity {
  capBarista: number; // バリスタが作れる上限
  capLemon: number;
  capSugar: number;
  capIngredient: number; // 材料から作れる上限
  maxMake: number; // 実際に作れる上限
}

// 作れる杯数（旧版の calcMake）。在庫と今月の仕入れを合わせて計算する。
export function productionCapacity(
  stock: Stock,
  lemonQty: number,
  sugarQty: number,
  baristaCount: number,
  config: Pick<GameConfig, 'baristaCapacity' | 'recipe'>,
): Capacity {
  const totalLemon = lemonQty + stock.lemon;
  const totalSugar = sugarQty + stock.sugar;
  const capBarista = baristaCount * config.baristaCapacity;
  const capLemon = config.recipe.lemon > 0 ? Math.floor(totalLemon / config.recipe.lemon) : 999999;
  const capSugar = config.recipe.sugar > 0 ? Math.floor(totalSugar / config.recipe.sugar) : 999999;
  const capIngredient = Math.min(capLemon, capSugar);
  return { capBarista, capLemon, capSugar, capIngredient, maxMake: Math.min(capBarista, capIngredient) };
}

// 入力を0以上の整数にそろえる
export function sanitizeDecision(d: MonthlyDecision): MonthlyDecision {
  const n = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  if (d.watching) return { lemonQty: 0, sugarQty: 0, price: 0, maxSell: 0, watching: true };
  const out: MonthlyDecision = { lemonQty: n(d.lemonQty), sugarQty: n(d.sugarQty), price: n(d.price) };
  if (d.maxSell !== undefined) out.maxSell = n(d.maxSell);
  return out;
}

// 市場に出す杯数。販売上限を省略したら作れるだけ出す。価格が0以下なら出さない。
export function offeredCups(decision: MonthlyDecision, capacity: Capacity): number {
  if (decision.watching || decision.price <= 0) return 0;
  const limit = decision.maxSell ?? capacity.maxMake;
  return Math.max(0, Math.min(limit, capacity.maxMake));
}

// 月末の在庫。市場に出した分の材料は、売れ残っても消費される。
export function nextStock(
  stock: Stock,
  lemonQty: number,
  sugarQty: number,
  offered: number,
  config: Pick<GameConfig, 'recipe'>,
): { stock: Stock; usedLemon: number; usedSugar: number } {
  const usedLemon = offered * config.recipe.lemon;
  const usedSugar = offered * config.recipe.sugar;
  return {
    stock: {
      lemon: Math.max(0, stock.lemon + lemonQty - usedLemon),
      sugar: Math.max(0, stock.sugar + sugarQty - usedSugar),
    },
    usedLemon,
    usedSugar,
  };
}
