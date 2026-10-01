// 対戦（GM・チーム）の決算レポート。ソロと同じ期末レポートと年次決算レポート（A4）を、
// Firebase から受け取った結果で組み立てる。計算は engine（termSummary・years など）に任せる。
// 2年以上のときはソロと同じ形：年ごとの「第◯期の決算」と、期末の通算のまとめ。

import { termSummary } from '../../engine/accounting';
import { rankTeams } from '../../engine/month';
import type { MonthResult, TeamState } from '../../engine/types';
import { MONTHS_PER_YEAR, resultsOfYear, standingsAt, yearlySummary, yearOf, yearsOf } from '../../engine/years';
import type { PublicConfig, TeamSlot } from '../../sync/schema';
import { difficultyLabel, patternLabel } from '../../i18n/content';
import { esc, signedYen, yen } from '../../ui/format';
import { renderTermReport } from './report';
import { openSheets, sheetHtml, summarySheetHtml } from './sheet';

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

function conditionOf(input: MultiReportInput, teamCount: number) {
  return {
    teamCount, elimination: input.pub.elimination === true,
    ...(input.pub.level ? { difficulty: difficultyLabel(input.pub.level) } : {}),
    ...(input.pub.pattern ? { pattern: patternLabel(input.pub.pattern) } : {}),
  };
}

const yearCount = (input: MultiReportInput) => yearsOf({ months: input.pub.months });
// 結果が出ている最後の年
const lastYearOf = (input: MultiReportInput) =>
  (input.results.length > 0 ? yearOf(input.results[input.results.length - 1]!.month) : 1);

// その年の結果と、年のはじめ・終わりの各チーム（ソロの yearStandings と同じ）
function yearStandings(input: MultiReportInput, year: number) {
  const all = orderedStates(input);
  const rs = resultsOfYear(input.results, year);
  const endMonth = rs.length > 0 ? rs[rs.length - 1]!.month : year * MONTHS_PER_YEAR;
  const atStart = standingsAt(input.results, all, (year - 1) * MONTHS_PER_YEAR, input.pub.startFund);
  const startBalances = Object.fromEntries(atStart.map((tm) => [tm.teamId, tm.balance]));
  // 「1年のもうけ」はその年の分
  const teams = standingsAt(input.results, all, endMonth, input.pub.startFund).map((tm, i) => ({
    ...tm, totalProfit: tm.totalProfit - atStart[i]!.totalProfit,
  }));
  return { rs, teams, startBalances };
}

// あるチームの、ある年の年次決算レポート（A4）1枚
function yearSheet(input: MultiReportInput, teamId: string, year: number): string {
  const { rs, teams, startBalances } = yearStandings(input, year);
  return sheetHtml({
    results: rs, teams, meId: teamId, startFund: startBalances[teamId] ?? input.pub.startFund,
    startCalendarMonth: input.pub.startCalendarMonth, recipe: input.pub.recipe, baristaCapacity: input.pub.baristaCapacity,
    condition: conditionOf(input, teams.length), ...(yearCount(input) > 1 ? { year } : {}),
  });
}

// あるチームの A4 一式：1年なら1枚。2年以上なら営業した年ごとの1枚＋通算の1枚
function teamSheets(input: MultiReportInput, teamId: string): string[] {
  const years = yearCount(input);
  if (years === 1) return [yearSheet(input, teamId, 1)];
  const all = orderedStates(input);
  const rows = yearlySummary(input.results, all, teamId, input.pub.recipe, input.pub.startFund);
  return [
    ...rows.map((r) => yearSheet(input, teamId, r.year)),
    summarySheetHtml({
      results: input.results, teams: all, meId: teamId, startFund: input.pub.startFund,
      startCalendarMonth: input.pub.startCalendarMonth, recipe: input.pub.recipe, baristaCapacity: input.pub.baristaCapacity,
      condition: conditionOf(input, all.length), years,
    }),
  ];
}

// ある年の期末レポート（画面）
function renderYearReport(container: HTMLElement, input: MultiReportInput, teamId: string, year: number, heading?: string) {
  const { rs, teams, startBalances } = yearStandings(input, year);
  renderTermReport(container, {
    results: rs, teams, names: namesOf(input), meId: teamId,
    startFund: input.pub.startFund, startCalendarMonth: input.pub.startCalendarMonth, recipe: input.pub.recipe,
    startBalances, ...(heading ? { heading } : {}),
  });
}

// チームの年の決算（2年以上のとき、12か月ごと）
export function renderTeamYearEnd(container: HTMLElement, input: MultiReportInput, teamId: string, year: number): void {
  container.innerHTML = `<div id="report"></div>
    <button class="btn secondary" id="sheet" type="button">📄 第${year}期の年次決算レポート（A4）を見る</button>
    <p class="muted center">GMが第${year + 1}期を始めるまで待ってください。</p>`;
  renderYearReport(container.querySelector<HTMLElement>('#report')!, input, teamId, year, `第${year}期の決算`);
  container.querySelector('#sheet')!.addEventListener('click', () => openSheets([yearSheet(input, teamId, year)]));
}

// チームの期末：1年ならソロと同じ期末レポート。2年以上なら通算のまとめ＋最後の年の決算。
// いちばん下に「トップにもどる」（GM が同じコードで次のゲームを始めると、この画面から続けて参加できる）
export function renderTeamFinal(
  container: HTMLElement, input: MultiReportInput, teamId: string,
  opts: { note?: string; heading?: string } = {}, // 最後のひとこと（ルームモードでは GM の話をしない）・見出し（途中で終えたとき）
): void {
  const years = yearCount(input);
  const sheets = teamSheets(input, teamId);
  container.innerHTML = `${years > 1 ? '<div id="total"></div>' : ''}<div id="report"></div>
    <button class="btn" id="sheet" type="button">📄 年次決算レポート（A4）を見る${sheets.length > 1 ? `（${sheets.length}枚）` : ''}</button>
    <div class="card center">
      <p style="margin:0 0 8px">${opts.note ?? 'おつかれさまでした！ GM が次のゲームを始めると、この画面からそのまま参加できます。'}</p>
      <a class="btn secondary" href="#/">トップにもどる</a>
    </div>`;
  if (years > 1) renderTotal(container.querySelector<HTMLElement>('#total')!, input, teamId, years);
  const last = lastYearOf(input);
  if (years === 1) renderYearReport(container.querySelector<HTMLElement>('#report')!, input, teamId, 1, opts.heading);
  else renderYearReport(container.querySelector<HTMLElement>('#report')!, input, teamId, last, `第${last}期の決算`);
  container.querySelector('#sheet')!.addEventListener('click', () => openSheets(sheets));
}

// 通算のまとめ（2年以上）：順位・通算のもうけ・年ごとの記録
function renderTotal(container: HTMLElement, input: MultiReportInput, teamId: string, years: number) {
  const all = orderedStates(input);
  const ranked = rankTeams([...all]);
  const me = all.find((tm) => tm.teamId === teamId);
  const rows = yearlySummary(input.results, all, teamId, input.pub.recipe, input.pub.startFund);
  container.innerHTML = `<div class="card center">
      <h2>${years}年間おつかれさまでした！</h2>
      <p class="big" style="margin:4px 0">${ranked.findIndex((tm) => tm.teamId === teamId) + 1}位 <span class="muted" style="font-size:1rem">／ ${all.length}チーム</span></p>
      ${me ? `<p style="margin:0">お金の残り <strong>${yen(me.balance)}</strong>（はじめ ${yen(input.pub.startFund)}）</p>
      <p style="margin:4px 0 0">${years}年間のもうけ <strong class="${me.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(me.totalProfit)}</strong></p>` : ''}
    </div>
    <div class="card"><h2>年ごとの記録</h2>
      <div class="table-scroll"><table class="table report-table slim-on-phone">
        <tr><th>期</th><th class="wide-only">売上</th><th class="wide-only">費用</th><th>利益</th><th>期末の資金</th><th>順位</th></tr>
        ${rows.map((r) => `<tr><td>${r.year}年目</td><td class="wide-only">${yen(r.revenue)}</td><td class="wide-only">${yen(r.cost)}</td>
          <td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td><td>${yen(r.endBalance)}</td><td>${r.rank}位</td></tr>`).join('')}
      </table></div>
    </div>`;
}

// GM の一覧（全チーム）。year を渡すとその年の分、渡さなければ全期間（通算）
function gmTable(input: MultiReportInput, year?: number): { html: string; ranked: TeamState[] } {
  const names = namesOf(input);
  const scoped = year ? yearStandings(input, year) : { rs: input.results, teams: orderedStates(input) };
  const ranked = rankTeams([...scoped.teams]);
  const years = yearCount(input);
  const profitLabel = year || years === 1 ? '1年のもうけ' : `${years}年間のもうけ`;
  const rows = ranked.map((tm, i) => {
    const s = termSummary(scoped.rs, tm.teamId, input.pub.recipe);
    const avgPrice = s.totalSold > 0 ? Math.round(s.totalRevenue / s.totalSold) : null;
    return `<tr><td>${i + 1}</td><td>${esc(names[tm.teamId] ?? tm.teamId)}</td>
      <td>${yen(s.totalRevenue)}</td><td>${yen(s.totalMaterialCost + s.totalLaborCost)}</td>
      <td class="${tm.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(tm.totalProfit)}</td><td>${yen(tm.balance)}</td>
      <td>${s.totalSold}／${s.totalOffered}杯</td><td>${avgPrice === null ? '—' : yen(avgPrice)}</td></tr>`;
  }).join('');
  return {
    ranked,
    html: `<div class="table-scroll"><table class="table">
        <tr><th>順位</th><th>チーム</th><th>売上</th><th>費用</th><th>${profitLabel}</th><th>お金の残り</th><th>売れた／作った</th><th>平均の値段</th></tr>
        ${rows}
      </table></div>
      <p class="muted">平均の値段 ＝ 売上 ÷ 売れた杯数。安く多く売ったチームと、高く少なく売ったチームを比べて振り返れます。</p>`,
  };
}

// GM の年の決算（2年以上のとき）：その年の一覧と、全チームのその年の A4
export function renderGmYearEnd(container: HTMLElement, input: MultiReportInput, year: number): void {
  const { html, ranked } = gmTable(input, year);
  container.innerHTML = `<div class="card">
      <h2>📊 第${year}期の決算（全チーム）</h2>
      ${html}
      <button class="btn secondary" id="yearSheets" type="button">📄 全チームの第${year}期の年次決算レポート（A4）をまとめて印刷</button>
    </div>`;
  container.querySelector('#yearSheets')!.addEventListener('click', () =>
    openSheets(ranked.map((tm) => yearSheet(input, tm.teamId, year))));
}

// GM の期末：全チームの一覧 ＋ チームごとのレポート ＋ 全チームの A4 をまとめて印刷
export function renderGmFinal(container: HTMLElement, input: MultiReportInput): void {
  const years = yearCount(input);
  const names = namesOf(input);
  const { html, ranked } = gmTable(input);
  container.innerHTML = `<div class="card">
      <h2>🏆 期末の結果（全チーム${years > 1 ? `・${years}年間の通算` : ''}）</h2>
      ${html}
      <button class="btn" id="allSheets" type="button">📄 全チームの年次決算レポート（A4）をまとめて印刷</button>
    </div>
    <div class="card">
      <h2>チームごとのレポート</h2>
      <div class="chips">${ranked.map((tm) => `<button class="small" type="button" data-report="${esc(tm.teamId)}">${esc(names[tm.teamId] ?? tm.teamId)}</button>`).join('')}</div>
    </div>
    <div id="teamReport"></div>`;
  container.querySelector('#allSheets')!.addEventListener('click', () =>
    openSheets(ranked.flatMap((tm) => teamSheets(input, tm.teamId))));
  const target = container.querySelector<HTMLElement>('#teamReport')!;
  container.querySelectorAll<HTMLButtonElement>('button[data-report]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.report!;
    const last = lastYearOf(input);
    renderYearReport(target, input, id, years === 1 ? 1 : last,
      `${names[id] ?? id} の${years === 1 ? '期末レポート' : `第${last}期の決算`}`);
    target.scrollIntoView({ behavior: 'smooth' });
  }));
}
