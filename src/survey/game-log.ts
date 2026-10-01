// ルームモードのゲームの記録（ログ）。期末になったとき、1ゲームにつき1件をスプレッドシートに送る。
// 送り先はアンケートと同じ GAS（gas/survey/Code.gs）。個人の情報は入れない（お店の名前と数字だけ）。

import { termSummary } from '../engine/accounting';
import { rankTeams } from '../engine/month';
import type { CpuType, MarketPattern, MonthResult, Recipe, TeamState } from '../engine/types';
import { sendSurvey, surveyEndpoint } from './survey';

export interface GameLogTeam {
  rank: number;
  name: string;
  kind: 'human' | CpuType; // 人か、ロボット店長の作戦
  profit: number;
  balance: number;
  avgPrice: number | null; // 売上 ÷ 売れた杯数
  sold: number;
}

export interface GameLogPayload {
  v: 1;
  kind: 'gameLog';
  mode: 'room';
  code: string;
  difficulty: string;
  pattern: string;
  humans: number;
  robots: number;
  months: number;
  teams: GameLogTeam[]; // 順位の順
  budgets: number[]; // 月ごとの市場の大きさ（お客さんが使えたお金）
  appVersion: string;
}

export function buildGameLog(input: {
  code: string;
  difficulty: string;
  pattern?: MarketPattern;
  results: MonthResult[];
  state: Record<string, TeamState>;
  names: Record<string, string>;
  robots: Record<string, CpuType>; // ロボットの席と作戦
  recipe: Recipe;
  appVersion: string;
}): GameLogPayload {
  const ranked = rankTeams(Object.values(input.state));
  const teams: GameLogTeam[] = ranked.map((t, i) => {
    const s = termSummary(input.results, t.teamId, input.recipe);
    return {
      rank: i + 1,
      name: input.names[t.teamId] ?? t.teamId,
      kind: input.robots[t.teamId] ?? 'human',
      profit: t.totalProfit,
      balance: t.balance,
      avgPrice: s.totalSold > 0 ? Math.round(s.totalRevenue / s.totalSold) : null,
      sold: s.totalSold,
    };
  });
  const robots = Object.keys(input.robots).length;
  return {
    v: 1, kind: 'gameLog', mode: 'room', code: input.code,
    difficulty: input.difficulty, pattern: input.pattern ?? '',
    humans: teams.length - robots, robots, months: input.results.length,
    teams, budgets: input.results.map((r) => r.marketBudget), appVersion: input.appVersion,
  };
}

export async function sendGameLog(payload: GameLogPayload, endpoint = surveyEndpoint()): Promise<boolean> {
  // アンケートと同じ送り方（text/plain の JSON）。送り先がなければ送らない
  return sendSurvey(payload as unknown as Parameters<typeof sendSurvey>[0], endpoint);
}
