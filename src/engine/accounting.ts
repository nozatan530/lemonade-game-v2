// 月次の損益。
// 初級は旧版と同じく「仕入れた分」をその月の原価にする（繰り越す在庫の分も、買った月の費用になる）。
// 「使った分」を原価にする方式は中級以上で導入する（docs/decisions.md 参照）。

import type { MonthResult, Recipe, UnitPrices } from './types';

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

// ---- 期末の振り返り ----

export interface MonthRow {
  month: number;
  marketBudget: number; // その月にお客さんが使えたお金
  price: number; // 0 = 静観
  offered: number;
  sold: number;
  unsold: number;
  revenue: number;
  materialCost: number; // 材料費（レモン＋砂糖）
  laborCost: number; // 人件費
  profit: number;
  balance: number; // 月末の資金
  wasteValue: number; // 売れ残りに使った材料の金額（売れ残り × 1杯の材料費）
}

export interface TermSummary {
  rows: MonthRow[];
  totalRevenue: number;
  totalMaterialCost: number;
  totalLaborCost: number;
  totalProfit: number;
  totalOffered: number;
  totalSold: number;
  totalUnsold: number;
  totalWasteValue: number;
  sellThrough: number | null; // 売れた割合（売れた数 ÷ お店に出した数）。出していなければ null
  bestMonth: MonthRow | null; // いちばんもうかった月
  worstMonth: MonthRow | null; // いちばんもうからなかった（損した）月
}

// あるチームの1年の振り返り。results は月の順に並んでいること
export function termSummary(results: MonthResult[], teamId: string, recipe: Recipe): TermSummary {
  const rows: MonthRow[] = [];
  for (const r of results) {
    const t = r.teamResults.find((x) => x.teamId === teamId);
    if (!t) continue;
    const materialPerCup = r.prices.lemon * recipe.lemon + r.prices.sugar * recipe.sugar;
    rows.push({
      month: r.month,
      marketBudget: r.marketBudget,
      price: t.price,
      offered: t.offered,
      sold: t.sold,
      unsold: t.unsold,
      revenue: t.revenue,
      materialCost: t.costLemon + t.costSugar,
      laborCost: t.costBarista,
      profit: t.profit,
      balance: t.balance,
      wasteValue: t.unsold * materialPerCup,
    });
  }
  const sum = (f: (m: MonthRow) => number) => rows.reduce((a, m) => a + f(m), 0);
  const totalOffered = sum((m) => m.offered);
  const totalSold = sum((m) => m.sold);
  // 同じ額なら早い月を選ぶ
  const best = rows.reduce<MonthRow | null>((b, m) => (!b || m.profit > b.profit ? m : b), null);
  const worst = rows.reduce<MonthRow | null>((w, m) => (!w || m.profit < w.profit ? m : w), null);
  return {
    rows,
    totalRevenue: sum((m) => m.revenue),
    totalMaterialCost: sum((m) => m.materialCost),
    totalLaborCost: sum((m) => m.laborCost),
    totalProfit: sum((m) => m.profit),
    totalOffered,
    totalSold,
    totalUnsold: sum((m) => m.unsold),
    totalWasteValue: sum((m) => m.wasteValue),
    sellThrough: totalOffered > 0 ? totalSold / totalOffered : null,
    bestMonth: best,
    worstMonth: worst,
  };
}
