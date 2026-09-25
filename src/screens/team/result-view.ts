// 月の結果と、期末の結果

import type { MonthResult, TeamState } from '../../engine/types';
import type { TeamSlot } from '../../sync/schema';
import { esc, signedYen, yen } from '../../ui/format';

export function renderMonthResult(
  container: HTMLElement,
  result: MonthResult,
  teamId: string,
  teams: Record<string, TeamSlot>,
): void {
  const r = result.teamResults.find((t) => t.teamId === teamId);
  if (!r) {
    container.innerHTML = '<div class="card">結果がありません。</div>';
    return;
  }
  const watching = r.offered === 0;
  const rows = [...result.teamResults]
    .sort((a, b) => (teams[a.teamId]?.order ?? 0) - (teams[b.teamId]?.order ?? 0))
    .map((t) => `<tr class="${t.teamId === teamId ? 'me' : ''}">
      <td>${esc(teams[t.teamId]?.name ?? t.teamId)}</td>
      <td>${t.offered === 0 ? '静観' : yen(t.price)}</td>
      <td>${t.sold}/${t.offered}杯</td>
      <td class="${t.profit >= 0 ? 'good' : 'bad'}">${signedYen(t.profit)}</td></tr>`)
    .join('');

  container.innerHTML = `
    <div class="card">
      <h2>今月の結果</h2>
      ${watching ? '<p>今月は静観しました（売っていません）。</p>' : ''}
      <table class="pl">
        <tr><td>売上<span class="explain">${r.sold}杯 × ${yen(r.price)}</span></td><td>${yen(r.revenue)}</td></tr>
        <tr><td>− 材料費（原価）<span class="explain">今月買ったレモン${r.lemonBought}個・砂糖${r.sugarBought}袋の代金</span></td><td>${yen(r.costLemon + r.costSugar)}</td></tr>
        <tr><td>− 人件費<span class="explain">バリスタ${r.baristaCount}人の給料</span></td><td>${yen(r.costBarista)}</td></tr>
        <tr class="total"><td>＝ もうけ（利益）</td><td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td></tr>
      </table>
      <p style="margin:10px 0 0">売れた数 <strong>${r.sold}杯</strong> ／ お店に出した数 ${r.offered}杯
        ${r.unsold > 0 ? `<br><span class="bad">売れ残り ${r.unsold}杯（捨てることになりました）</span>` : ''}</p>
      <p style="margin:6px 0 0">お金の残り <strong class="num">${yen(r.balance)}</strong></p>
      <p class="muted" style="margin:4px 0 0">来月に残る材料：🍋${r.stock.lemon}個・🍬${r.stock.sugar}袋</p>
    </div>
    <div class="card">
      <h2>みんなの結果</h2>
      <p class="muted" style="margin:0 0 6px">今月お客さんが使えたお金（市場の大きさ）：${yen(result.marketBudget)}。安いお店から順に、このお金がなくなるまで買います。</p>
      <table class="table">
        <tr><th>チーム</th><th>値段</th><th>売れた数</th><th>もうけ</th></tr>
        ${rows}
      </table>
    </div>
    <p class="muted center">GMが次の月を始めるまで待ってください。</p>`;
}

export function renderFinal(
  container: HTMLElement,
  state: Record<string, TeamState>,
  teamId: string,
  teams: Record<string, TeamSlot>,
): void {
  const ranked = Object.values(state).sort((a, b) => b.balance - a.balance);
  const me = state[teamId];
  const rank = ranked.findIndex((t) => t.teamId === teamId) + 1;
  const rows = ranked.map((t, i) => `<tr class="${t.teamId === teamId ? 'me' : ''}">
    <td>${i + 1}. ${esc(teams[t.teamId]?.name ?? t.teamId)}</td>
    <td>${yen(t.balance)}</td>
    <td class="${t.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(t.totalProfit)}</td></tr>`).join('');
  container.innerHTML = `
    <div class="card center">
      <h2>1年間おつかれさまでした！</h2>
      ${me ? `<p class="big">${rank}位</p>
      <p>お金の残り <strong>${yen(me.balance)}</strong><br>1年間のもうけ <strong class="${me.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(me.totalProfit)}</strong></p>` : ''}
    </div>
    <div class="card">
      <h2>最終順位</h2>
      <table class="table"><tr><th>チーム</th><th>お金の残り</th><th>1年のもうけ</th></tr>${rows}</table>
    </div>`;
}
