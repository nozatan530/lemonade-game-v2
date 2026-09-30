// 何年も続けて経営するとき（ソロモードで1〜10年）の、年の区切りと年ごとの集計。
// 期の月は通しの番号（1〜12×年数）。季節や単価の動きは暦の月で決まるので、毎年くり返す。

import { termSummary } from './accounting';
import { missedCups } from './feedback';
import { rankTeams } from './month';
import type { GameConfig, MonthResult, Recipe, TeamState } from './types';

export const MONTHS_PER_YEAR = 12;
export const MAX_YEARS = 10;

// 通しの月が何年目か（1始まり）
export function yearOf(month: number): number {
  return Math.ceil(month / MONTHS_PER_YEAR);
}

// その年の何か月目か（1〜12）
export function monthInYear(month: number): number {
  return ((month - 1) % MONTHS_PER_YEAR) + 1;
}

// 経営する年数（期の月数から）
export function yearsOf(config: Pick<GameConfig, 'months'>): number {
  return Math.max(1, Math.ceil(config.months / MONTHS_PER_YEAR));
}

// 年の最後の月か（最後の年の最後の月もふくむ）
export function isYearEnd(month: number): boolean {
  return month % MONTHS_PER_YEAR === 0;
}

// その年の月の結果だけ
export function resultsOfYear(results: MonthResult[], year: number): MonthResult[] {
  return results.filter((r) => yearOf(r.month) === year);
}

// ある月の終わりの時点の、各お店の資金・もうけ・脱落（年の決算の順位に使う）
export function standingsAt(results: MonthResult[], teams: TeamState[], uptoMonth: number, startFund: number): TeamState[] {
  return teams.map((t) => {
    let balance = startFund;
    let totalProfit = 0;
    for (const r of results) {
      if (r.month > uptoMonth) break;
      const x = r.teamResults.find((y) => y.teamId === t.teamId);
      if (!x) continue;
      balance = x.balance;
      totalProfit += x.profit;
    }
    const { eliminatedMonth, ...rest } = t;
    return {
      ...rest, balance, totalProfit,
      ...(eliminatedMonth !== undefined && eliminatedMonth <= uptoMonth ? { eliminatedMonth } : {}),
    };
  });
}

export interface YearRow {
  year: number;
  revenue: number;
  cost: number; // 材料費＋人件費
  profit: number;
  startBalance: number; // 年のはじめの資金
  endBalance: number; // 年の終わりの資金
  rank: number; // 年の終わりの順位
  sold: number;
  unsold: number;
  missed: number;
  missedRevenue: number; // のがした売上
  months: number; // その年に営業した月の数（脱落したら少なくなる）
}

// 年ごとのまとめ（通算レポート用）。まだ始まっていない年や、脱落して営業しなかった年は入れない
export function yearlySummary(
  results: MonthResult[],
  teams: TeamState[],
  teamId: string,
  recipe: Recipe,
  startFund: number,
): YearRow[] {
  const rows: YearRow[] = [];
  const lastYear = results.length > 0 ? yearOf(results[results.length - 1]!.month) : 0;
  let startBalance = startFund;
  for (let year = 1; year <= lastYear; year++) {
    const rs = resultsOfYear(results, year);
    const s = termSummary(rs, teamId, recipe);
    if (s.rows.length === 0) break;
    const endMonth = rs[rs.length - 1]!.month;
    const standings = rankTeams(standingsAt(results, teams, endMonth, startFund));
    const endBalance = s.rows[s.rows.length - 1]!.balance;
    rows.push({
      year,
      revenue: s.totalRevenue,
      cost: s.totalMaterialCost + s.totalLaborCost,
      profit: s.totalProfit,
      startBalance,
      endBalance,
      rank: standings.findIndex((t) => t.teamId === teamId) + 1,
      sold: s.totalSold,
      unsold: s.totalUnsold,
      missed: rs.reduce((a, r) => a + missedCups(r, teamId), 0),
      missedRevenue: rs.reduce((a, r) => a + missedCups(r, teamId) * (r.teamResults.find((x) => x.teamId === teamId)?.price ?? 0), 0),
      months: s.rows.length,
    });
    startBalance = endBalance;
  }
  return rows;
}
