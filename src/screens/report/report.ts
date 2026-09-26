// 期末レポート：1年の振り返り。ソロモードの期末で使う（対戦の期末でも使える形にしている）。
//   まとめ（順位・資金・もうけ・いちばんもうかった月／損した月・売れ残り）
//   グラフ（資金の推移／自分の月ごとのもうけ／値段の推移）
//   表（月ごとの数字）
// 集計は engine の termSummary。ここでは表示するだけ。

import { termSummary } from '../../engine/accounting';
import type { MonthResult, Recipe, TeamState } from '../../engine/types';
import { barChartSvg } from '../../ui/bar-chart';
import { calendarMonth, esc, signedYen, yen } from '../../ui/format';
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
  const monthName = (m: number) => `${calendarMonth(m, input.startCalendarMonth)}月`;
  const name = (id: string) => names[id] ?? id;

  const tile = (label: string, value: string, note = '', cls = '') =>
    `<div class="tile"><div class="tile-label">${label}</div><div class="tile-value ${cls}">${value}</div>${note ? `<div class="tile-note">${note}</div>` : ''}</div>`;

  container.innerHTML = `
    <div class="card center">
      <h2>1年間おつかれさまでした！</h2>
      <p class="big" style="margin:4px 0">${rank}位 <span class="muted" style="font-size:1rem">／ ${teams.length}チーム</span></p>
      ${me ? `<p style="margin:0">お金の残り <strong>${yen(me.balance)}</strong>（はじめ ${yen(input.startFund)}）</p>` : ''}
    </div>

    <div class="card">
      <h2>1年のまとめ</h2>
      <div class="tiles">
        ${tile('1年のもうけ', signedYen(s.totalProfit), '', s.totalProfit >= 0 ? 'good' : 'bad')}
        ${tile('売上', yen(s.totalRevenue), `${s.totalSold}杯売れた`)}
        ${tile('費用', yen(s.totalMaterialCost + s.totalLaborCost), `材料 ${yen(s.totalMaterialCost)}<br>人件費 ${yen(s.totalLaborCost)}`)}
        ${tile('売れた割合', s.sellThrough === null ? '—' : `${Math.round(s.sellThrough * 100)}%`, `${s.totalOffered}杯中 ${s.totalSold}杯`)}
        ${s.bestMonth ? tile('いちばんもうかった月', monthName(s.bestMonth.month), signedYen(s.bestMonth.profit)) : ''}
        ${s.worstMonth ? tile('いちばんもうからなかった月', monthName(s.worstMonth.month), signedYen(s.worstMonth.profit)) : ''}
        ${tile('売れ残り（捨てた数）', `${s.totalUnsold}杯`, `材料 ${yen(s.totalWasteValue)} 分`, s.totalUnsold > 0 ? 'bad' : '')}
      </div>
    </div>

    <div class="card"><h2>お金の残りの推移</h2><div class="chart" id="balanceChart"></div></div>
    <div class="card"><h2>月ごとのもうけ（${esc(name(meId))}）</h2>
      <p class="muted" style="margin:0 0 4px">0円の線より上がもうけ、下が損。</p>
      <div class="chart" id="profitChart"></div></div>
    <div class="card"><h2>値段の推移</h2>
      <p class="muted" style="margin:0 0 4px">ほかのお店がどんな値段をつけたか見てみよう。線が切れている月は、売らなかった月です。</p>
      <div class="chart" id="priceChart"></div></div>

    <div class="card">
      <h2>月ごとの数字（${esc(name(meId))}）</h2>
      <div class="table-scroll">
        <table class="table report-table">
          <tr><th>月</th><th>お客さんの<br>お金</th><th>値段</th><th>売れた<br>／作った</th><th>売れ残り</th>
            <th>売上</th><th>材料費</th><th>人件費</th><th>もうけ</th><th>お金の<br>残り</th></tr>
          ${s.rows.map((r) => `<tr class="${r.month === s.bestMonth?.month ? 'best' : r.month === s.worstMonth?.month ? 'worst' : ''}">
            <td>${monthName(r.month)}</td><td>${yen(r.marketBudget)}</td>
            <td>${r.offered === 0 ? '静観' : yen(r.price)}</td><td>${r.sold}／${r.offered}</td>
            <td class="${r.unsold > 0 ? 'bad' : ''}">${r.unsold}</td>
            <td>${yen(r.revenue)}</td><td>${yen(r.materialCost)}</td><td>${yen(r.laborCost)}</td>
            <td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td><td>${yen(r.balance)}</td></tr>`).join('')}
          <tr class="sum"><td>合計</td><td></td><td></td><td>${s.totalSold}／${s.totalOffered}</td><td>${s.totalUnsold}</td>
            <td>${yen(s.totalRevenue)}</td><td>${yen(s.totalMaterialCost)}</td><td>${yen(s.totalLaborCost)}</td>
            <td class="${s.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(s.totalProfit)}</td><td></td></tr>
        </table>
      </div>
      <p class="muted" style="margin:6px 0 0">「お客さんのお金」はその月にお客さんが使えたお金の合計（市場の大きさ）。安いお店から順に、これがなくなるまで買います。</p>
    </div>

    <div class="card">
      <h2>最終順位</h2>
      <table class="table"><tr><th>チーム</th><th>お金の残り</th><th>1年のもうけ</th></tr>
        ${ranked.map((t, i) => `<tr class="${t.teamId === meId ? 'me' : ''}"><td>${i + 1}. ${esc(name(t.teamId))}</td>
          <td>${yen(t.balance)}</td><td class="${t.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(t.totalProfit)}</td></tr>`).join('')}
      </table>
    </div>`;

  // グラフは表示する幅に合わせて描く（スマホで文字が小さくならないように）
  const width = (id: string) => Math.max(300, Math.floor(container.querySelector<HTMLElement>(`#${id}`)!.clientWidth || 320));
  const xLabels = ['はじめ', ...results.map((r) => monthName(r.month))];
  const monthLabels = results.map((r) => monthName(r.month));
  const man = (v: number) => (v === 0 ? '0' : `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万`);

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
      lineChartSvg({ series: balanceSeries, xLabels, formatY: man, width: width('balanceChart'), height: 240, ariaLabel: 'お金の残りの推移' });
    container.querySelector('#priceChart')!.innerHTML = legendHtml(priceSeries) +
      lineChartSvg({ series: priceSeries, xLabels: monthLabels, formatY: (v) => `${v}円`, width: width('priceChart'), height: 220, ariaLabel: '値段の推移', includeZero: false });
  } else {
    container.querySelector('#balanceChart')!.innerHTML = '<p class="muted">チームが多いのでグラフは省略します。下の順位表を見てください。</p>';
    container.querySelector('#priceChart')!.closest('.card')!.remove();
  }
  container.querySelector('#profitChart')!.innerHTML = barChartSvg({
    values: s.rows.map((r) => r.profit),
    labels: s.rows.map((r) => monthName(r.month)),
    formatY: man,
    formatValue: signedYen,
    width: width('profitChart'),
    height: 200,
    ariaLabel: '月ごとのもうけ',
  });
}
