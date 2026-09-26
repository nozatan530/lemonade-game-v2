// 期末レポート：1年の振り返り。ソロモードの期末で使う（対戦の期末でも使える形にしている）。
//   まとめ（順位・資金・もうけ・いちばんもうかった月／損した月・売れ残り）
//   グラフ（資金の推移／自分の月ごとのもうけ／値段の推移）
//   表（月ごとの数字）
// 集計は engine の termSummary。ここでは表示するだけ。

import { termSummary } from '../../engine/accounting';
import type { MonthResult, Recipe, TeamState } from '../../engine/types';
import { barChartSvg } from '../../ui/bar-chart';
import { lang, t } from '../../i18n';
import { esc, monthShort, signedYen, yen } from '../../ui/format';
import { legendHtml, lineChartSvg, MAX_SERIES, type Series } from '../../ui/line-chart';

export interface ReportInput {
  results: MonthResult[];
  teams: TeamState[]; // 並び順 = 色の順（グラフの色はチームごとに固定）
  names: Record<string, string>;
  meId: string;
  startFund: number;
  startCalendarMonth: number;
  recipe: Recipe;
}

export function renderTermReport(container: HTMLElement, input: ReportInput): void {
  const { results, teams, names, meId } = input;
  const s = termSummary(results, meId, input.recipe);
  const me = teams.find((t) => t.teamId === meId);
  const ranked = [...teams].sort((a, b) => b.balance - a.balance);
  const rank = ranked.findIndex((t) => t.teamId === meId) + 1;
  const monthName = (m: number) => monthShort(m, input.startCalendarMonth);
  const name = (id: string) => names[id] ?? id;

  const tile = (label: string, value: string, note = '', cls = '') =>
    `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value ${cls}">${value}</div>${note ? `<div class="tile-note">${note}</div>` : ''}</div>`;

  container.innerHTML = `
    <div class="card center">
      <h2>${t('report.h2')}</h2>
      <p class="big" style="margin:4px 0">${t('report.rank', { rank })} <span class="muted" style="font-size:1rem">${t('report.ofTeams', { n: teams.length })}</span></p>
      ${me ? `<p style="margin:0">${t('report.balance', { b: yen(me.balance), s: yen(input.startFund) })}</p>` : ''}
    </div>

    <div class="card">
      <h2>${t('report.summary')}</h2>
      <div class="tiles">
        ${tile(t('report.tile.profit'), signedYen(s.totalProfit), '', s.totalProfit >= 0 ? 'good' : 'bad')}
        ${tile(t('report.tile.sales'), yen(s.totalRevenue), t('report.tile.soldCups', { n: s.totalSold }))}
        ${tile(t('report.tile.cost'), yen(s.totalMaterialCost + s.totalLaborCost), t('report.tile.costNote', { m: yen(s.totalMaterialCost), l: yen(s.totalLaborCost) }))}
        ${tile(t('report.tile.sellThrough'), s.sellThrough === null ? '—' : `${Math.round(s.sellThrough * 100)}%`, t('report.tile.sellThroughNote', { offered: s.totalOffered, sold: s.totalSold }))}
        ${s.bestMonth ? tile(t('report.tile.best'), monthName(s.bestMonth.month), signedYen(s.bestMonth.profit)) : ''}
        ${s.worstMonth ? tile(t('report.tile.worst'), monthName(s.worstMonth.month), signedYen(s.worstMonth.profit)) : ''}
        ${tile(t('report.tile.waste'), t('input.cups', { n: s.totalUnsold }), t('report.tile.wasteNote', { v: yen(s.totalWasteValue) }), s.totalUnsold > 0 ? 'bad' : '')}
      </div>
    </div>

    <div class="card"><h2>${t('report.balanceChart')}</h2><div class="chart" id="balanceChart"></div></div>
    <div class="card"><h2>${t('report.profitChart', { name: esc(name(meId)) })}</h2>
      <p class="muted" style="margin:0 0 4px">${t('report.profitChart.note')}</p>
      <div class="chart" id="profitChart"></div></div>
    <div class="card"><h2>${t('report.priceChart')}</h2>
      <p class="muted" style="margin:0 0 4px">${t('report.priceChart.note')}</p>
      <div class="chart" id="priceChart"></div></div>

    <div class="card">
      <h2>${t('report.table', { name: esc(name(meId)) })}</h2>
      <div class="table-scroll">
        <table class="table report-table">
          <tr><th>${t('report.th.month')}</th><th>${t('report.th.market')}</th><th>${t('report.th.price')}</th><th>${t('report.th.soldMade')}</th><th>${t('report.th.unsold')}</th>
            <th>${t('report.th.sales')}</th><th>${t('report.th.material')}</th><th>${t('report.th.labor')}</th><th>${t('report.th.profit')}</th><th>${t('report.th.balance')}</th></tr>
          ${s.rows.map((r) => `<tr class="${r.month === s.bestMonth?.month ? 'best' : r.month === s.worstMonth?.month ? 'worst' : ''}">
            <td>${monthName(r.month)}</td><td>${yen(r.marketBudget)}</td>
            <td>${r.offered === 0 ? t('result.sat') : yen(r.price)}</td><td>${r.sold}／${r.offered}</td>
            <td class="${r.unsold > 0 ? 'bad' : ''}">${r.unsold}</td>
            <td>${yen(r.revenue)}</td><td>${yen(r.materialCost)}</td><td>${yen(r.laborCost)}</td>
            <td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td><td>${yen(r.balance)}</td></tr>`).join('')}
          <tr class="sum"><td>${t('report.total')}</td><td></td><td></td><td>${s.totalSold}／${s.totalOffered}</td><td>${s.totalUnsold}</td>
            <td>${yen(s.totalRevenue)}</td><td>${yen(s.totalMaterialCost)}</td><td>${yen(s.totalLaborCost)}</td>
            <td class="${s.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(s.totalProfit)}</td><td></td></tr>
        </table>
      </div>
      <p class="muted" style="margin:6px 0 0">${t('report.tableNote')}</p>
    </div>

    <div class="card">
      <h2>${t('report.final')}</h2>
      <table class="table"><tr><th>${t('report.th.team')}</th><th>${t('result.balance')}</th><th>${t('report.th.yearProfit')}</th></tr>
        ${ranked.map((t, i) => `<tr class="${t.teamId === meId ? 'me' : ''}"><td>${i + 1}. ${esc(name(t.teamId))}</td>
          <td>${yen(t.balance)}</td><td class="${t.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(t.totalProfit)}</td></tr>`).join('')}
      </table>
    </div>`;

  // グラフは表示する幅に合わせて描く（スマホで文字が小さくならないように）
  const width = (id: string) => Math.max(300, Math.floor(container.querySelector<HTMLElement>(`#${id}`)!.clientWidth || 320));
  const xLabels = [t('report.start'), ...results.map((r) => monthName(r.month))];
  const monthLabels = results.map((r) => monthName(r.month));
  // 縦軸の金額：日本語は「万」、英語は「k」
  const man = (v: number) => (v === 0 ? '0' : lang() === 'en'
    ? `${(v / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`
    : `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万`);

  if (teams.length <= MAX_SERIES) {
    const balanceSeries: Series[] = teams.map((t, i) => ({
      name: name(t.teamId), slot: i, emphasis: t.teamId === meId,
      values: [input.startFund, ...results.map((r) => r.teamResults.find((x) => x.teamId === t.teamId)?.balance ?? null)],
    }));
    const priceSeries: Series[] = teams.map((t, i) => ({
      name: name(t.teamId), slot: i, emphasis: t.teamId === meId,
      values: results.map((r) => {
        const x = r.teamResults.find((y) => y.teamId === t.teamId);
        return x && x.offered > 0 ? x.price : null;
      }),
    }));
    container.querySelector('#balanceChart')!.innerHTML = legendHtml(balanceSeries) +
      lineChartSvg({ series: balanceSeries, xLabels, formatY: man, width: width('balanceChart'), height: 240, ariaLabel: t('report.balanceChart') });
    container.querySelector('#priceChart')!.innerHTML = legendHtml(priceSeries) +
      lineChartSvg({ series: priceSeries, xLabels: monthLabels, formatY: (v) => (lang() === 'en' ? `¥${v}` : `${v}円`), width: width('priceChart'), height: 220, ariaLabel: t('report.priceChart'), includeZero: false });
  } else {
    container.querySelector('#balanceChart')!.innerHTML = `<p class="muted">${t('report.tooMany')}</p>`;
    container.querySelector('#priceChart')!.closest('.card')!.remove();
  }
  container.querySelector('#profitChart')!.innerHTML = barChartSvg({
    values: s.rows.map((r) => r.profit),
    labels: s.rows.map((r) => monthName(r.month)),
    formatY: man,
    formatValue: signedYen,
    width: width('profitChart'),
    height: 200,
    ariaLabel: t('report.profitChart', { name: name(meId) }),
  });
}
