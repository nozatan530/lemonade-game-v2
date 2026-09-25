// 1か月分の処理をまとめる。状態と入力を受け取り、新しい状態と結果を返す。

import { purchaseBasisCosts } from './accounting';
import { isQuarterStart } from './config';
import { nextStock, offeredCups, productionCapacity, sanitizeDecision } from './inventory';
import { allocatePriceSegment, type Offer } from './market';
import type {
  GameConfig, MonthConditions, MonthlyDecision, MonthResult, Submission, TeamMonthResult, TeamState,
} from './types';

export function initialTeamState(teamId: string, name: string, config: GameConfig): TeamState {
  return { teamId, name, balance: config.startFund, totalProfit: 0, stock: { lemon: 0, sugar: 0 }, baristaCount: 0 };
}

// 締切までに提出しなかったチームは、前月と同じ月の決定で処理する（前月がなければ静観）。
// 四半期の決定は補わない（いまのバリスタ人数のまま）。
// 補った提出は、提出済みのチームより後の順番にする。
export function fillMissingSubmissions(
  teams: TeamState[],
  submissions: Submission[],
  previousDecisions: ReadonlyMap<string, MonthlyDecision>,
): Submission[] {
  const submitted = new Set(submissions.map((s) => s.teamId));
  let order = submissions.reduce((max, s) => Math.max(max, s.order), 0);
  const filled = [...submissions];
  for (const t of teams) {
    if (submitted.has(t.teamId)) continue;
    const prev = previousDecisions.get(t.teamId);
    filled.push({
      teamId: t.teamId,
      monthlyDecision: prev ? { ...prev } : { lemonQty: 0, sugarQty: 0, price: 0, watching: true },
      order: ++order,
    });
  }
  return filled;
}

// 1か月を処理する。submissions は全チーム分そろっていること（fillMissingSubmissions を先に使う）。
export function resolveMonth(
  config: GameConfig,
  teams: TeamState[],
  conditions: MonthConditions,
  submissions: Submission[],
): { teams: TeamState[]; result: MonthResult } {
  const byTeam = new Map(submissions.map((s) => [s.teamId, s]));

  const plans = teams.map((t) => {
    const sub = byTeam.get(t.teamId);
    if (!sub) throw new Error(`${t.name} の提出がありません`);
    const decision = sanitizeDecision(sub.monthlyDecision);
    const baristaCount = isQuarterStart(conditions.month) && sub.quarterlyDecision
      ? Math.max(0, Math.floor(sub.quarterlyDecision.baristaCount))
      : t.baristaCount;
    const capacity = productionCapacity(t.stock, decision.lemonQty, decision.sugarQty, baristaCount, config);
    const offered = offeredCups(decision, capacity);
    const price = offered > 0 ? decision.price : 0;
    return { team: t, decision, baristaCount, offered, price, order: sub.order };
  });

  const offers: Offer[] = plans.map((p) => ({ teamId: p.team.teamId, price: p.price, offered: p.offered, order: p.order }));
  const sold = allocatePriceSegment(conditions.marketBudget, offers);

  const newTeams: TeamState[] = [];
  const teamResults: TeamMonthResult[] = plans.map((p) => {
    const t = p.team;
    const soldCups = sold.get(t.teamId) ?? 0;
    const revenue = soldCups * p.price;
    const costs = purchaseBasisCosts(p.decision.lemonQty, p.decision.sugarQty, p.baristaCount, conditions.prices);
    const inv = nextStock(t.stock, p.decision.lemonQty, p.decision.sugarQty, p.offered, config);
    const profit = revenue - costs.totalCost;
    const balance = t.balance + profit;
    newTeams.push({
      ...t,
      balance,
      totalProfit: t.totalProfit + profit,
      stock: inv.stock,
      baristaCount: p.baristaCount,
    });
    return {
      teamId: t.teamId,
      price: p.price,
      offered: p.offered,
      sold: soldCups,
      unsold: p.offered - soldCups,
      revenue,
      lemonBought: p.decision.lemonQty,
      sugarBought: p.decision.sugarQty,
      baristaCount: p.baristaCount,
      ...costs,
      profit,
      usedLemon: inv.usedLemon,
      usedSugar: inv.usedSugar,
      stock: inv.stock,
      balance,
    };
  });

  return {
    teams: newTeams,
    result: {
      month: conditions.month,
      marketBudget: conditions.marketBudget,
      prices: { ...conditions.prices },
      teamResults,
    },
  };
}
