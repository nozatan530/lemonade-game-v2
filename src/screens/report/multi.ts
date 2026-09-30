// 対戦（GM・チーム）の期末レポート。ソロと同じ期末レポートと年次決算レポート（A4）を、
// Firebase から受け取った結果で組み立てる。計算は engine（termSummary など）に任せる。

import { termSummary } from '../../engine/accounting';
import { rankTeams } from '../../engine/month';
import type { MonthResult, TeamState } from '../../engine/types';
import type { PublicConfig, TeamSlot } from '../../sync/schema';
import { esc, signedYen, yen } from '../../ui/format';
import { renderTermReport } from './report';
import { openSheets, sheetHtml } from './sheet';

export interface MultiReportInput {
  results: MonthResult[];
  state: Record<string, TeamState>;
  teams: Record<string, TeamSlot>;
  pub: PublicConfig;
}

// 並び順 = 参加画面の順（グラフの色をチームごとに固定するため）
function orderedStates(input: MultiReportInput): TeamState[] {
  return Object.values(input.state)
    .sort((a, b) => (input.teams[a.teamId]?.order ?? 0) - (input.teams[b.teamId]?.order ?? 0));
}

function namesOf(input: MultiReportInput): Record<string, string> {
  return Object.fromEntries(Object.entries(input.teams).map(([id, s]) => [id, s.name]));
}

// あるチームの年次決算レポート（A4）1枚
function teamSheet(input: MultiReportInput, teamId: string): string {
  const teams = orderedStates(input);
  return sheetHtml({
    results: input.results, teams, meId: teamId, startFund: input.pub.startFund,
    startCalendarMonth: input.pub.startCalendarMonth, recipe: input.pub.recipe, baristaCapacity: input.pub.baristaCapacity,
    condition: { teamCount: teams.length, elimination: input.pub.elimination === true },
  });
}

// チームの期末：ソロと同じ期末レポート ＋ 自分の年次決算レポート（A4）
export function renderTeamFinal(container: HTMLElement, input: MultiReportInput, teamId: string): void {
  container.innerHTML = '<div id="report"></div><button class="btn" id="sheet" type="button">📄 年次決算レポート（A4）を見る</button>';
  renderTermReport(container.querySelector<HTMLElement>('#report')!, {
    results: input.results, teams: orderedStates(input), names: namesOf(input), meId: teamId,
    startFund: input.pub.startFund, startCalendarMonth: input.pub.startCalendarMonth, recipe: input.pub.recipe,
  });
  container.querySelector('#sheet')!.addEventListener('click', () => openSheets([teamSheet(input, teamId)]));
}

// GM の期末：全チームの一覧 ＋ チームごとのレポート ＋ 全チームの A4 をまとめて印刷
export function renderGmFinal(container: HTMLElement, input: MultiReportInput): void {
  const ranked = rankTeams(orderedStates(input));
  const names = namesOf(input);
  const rows = ranked.map((tm, i) => {
    const s = termSummary(input.results, tm.teamId, input.pub.recipe);
    const avgPrice = s.totalSold > 0 ? Math.round(s.totalRevenue / s.totalSold) : null;
    return `<tr><td>${i + 1}</td><td>${esc(names[tm.teamId] ?? tm.teamId)}</td>
      <td>${yen(s.totalRevenue)}</td><td>${yen(s.totalMaterialCost + s.totalLaborCost)}</td>
      <td class="${tm.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(tm.totalProfit)}</td><td>${yen(tm.balance)}</td>
      <td>${s.totalSold}／${s.totalOffered}杯</td><td>${avgPrice === null ? '—' : yen(avgPrice)}</td></tr>`;
  }).join('');
  container.innerHTML = `<div class="card">
      <h2>🏆 期末の結果（全チーム）</h2>
      <div class="table-scroll"><table class="table">
        <tr><th>順位</th><th>チーム</th><th>売上</th><th>費用</th><th>1年のもうけ</th><th>お金の残り</th><th>売れた／作った</th><th>平均の値段</th></tr>
        ${rows}
      </table></div>
      <p class="muted">平均の値段 ＝ 売上 ÷ 売れた杯数。安く多く売ったチームと、高く少なく売ったチームを比べて振り返れます。</p>
      <button class="btn" id="allSheets" type="button">📄 全チームの年次決算レポート（A4）をまとめて印刷</button>
    </div>
    <div class="card">
      <h2>チームごとのレポート</h2>
      <div class="chips">${ranked.map((tm) => `<button class="small" type="button" data-report="${esc(tm.teamId)}">${esc(names[tm.teamId] ?? tm.teamId)}</button>`).join('')}</div>
    </div>
    <div id="teamReport"></div>`;
  container.querySelector('#allSheets')!.addEventListener('click', () =>
    openSheets(ranked.map((tm) => teamSheet(input, tm.teamId))));
  const target = container.querySelector<HTMLElement>('#teamReport')!;
  container.querySelectorAll<HTMLButtonElement>('button[data-report]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.report!;
    renderTermReport(target, {
      results: input.results, teams: orderedStates(input), names, meId: id,
      startFund: input.pub.startFund, startCalendarMonth: input.pub.startCalendarMonth, recipe: input.pub.recipe,
      heading: `${names[id] ?? id} の期末レポート`,
    });
    target.scrollIntoView({ behavior: 'smooth' });
  }));
}
