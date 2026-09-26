// 月の結果と、期末の結果

import type { MonthResult, TeamState } from '../../engine/types';
import type { TeamSlot } from '../../sync/schema';
import { t as tr } from '../../i18n';
import { esc, signedYen, yen } from '../../ui/format';

export function renderMonthResult(
  container: HTMLElement,
  result: MonthResult,
  teamId: string,
  teams: Record<string, TeamSlot>,
  options: { onNext?: () => void; nextLabel?: string } = {}, // ソロモードでは「次の月へ」ボタンを出す
): void {
  const r = result.teamResults.find((t) => t.teamId === teamId);
  if (!r) {
    container.innerHTML = `<div class="card">${tr('result.none')}</div>`;
    return;
  }
  const watching = r.offered === 0;
  const rows = [...result.teamResults]
    .sort((a, b) => (teams[a.teamId]?.order ?? 0) - (teams[b.teamId]?.order ?? 0))
    .map((t) => `<tr class="${t.teamId === teamId ? 'me' : ''}">
      <td>${esc(teams[t.teamId]?.name ?? t.teamId)}</td>
      <td>${t.offered === 0 ? tr('result.sat') : yen(t.price)}</td>
      <td>${tr('result.soldCell', { sold: t.sold, offered: t.offered })}</td>
      <td class="${t.profit >= 0 ? 'good' : 'bad'}">${signedYen(t.profit)}</td></tr>`)
    .join('');

  container.innerHTML = `
    <div class="card">
      <h2>${tr('result.h2')}</h2>
      ${watching ? `<p>${tr('result.watched')}</p>` : ''}
      <table class="pl">
        <tr><td>${tr('result.sales')}<span class="explain">${tr('result.salesExplain', { sold: r.sold, price: yen(r.price) })}</span></td><td>${yen(r.revenue)}</td></tr>
        <tr><td>${tr('result.material')}<span class="explain">${tr('result.materialExplain', { l: r.lemonBought, s: r.sugarBought })}</span></td><td>${yen(r.costLemon + r.costSugar)}</td></tr>
        <tr><td>${tr('result.labor')}<span class="explain">${tr('result.laborExplain', { n: r.baristaCount })}</span></td><td>${yen(r.costBarista)}</td></tr>
        <tr class="total"><td>${tr('result.profit')}</td><td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td></tr>
      </table>
      <p style="margin:10px 0 0">${tr('result.soldLine', { sold: r.sold, offered: r.offered })}
        ${r.unsold > 0 ? `<br><span class="bad">${tr('result.unsold', { n: r.unsold })}</span>` : ''}</p>
      <p style="margin:6px 0 0">${tr('result.balance')} <strong class="num">${yen(r.balance)}</strong></p>
      <p class="muted" style="margin:4px 0 0">${tr('result.carry', { l: r.stock.lemon, s: r.stock.sugar })}</p>
    </div>
    <div class="card">
      <h2>${tr('result.all.h2')}</h2>
      <p class="muted" style="margin:0 0 6px">${tr('result.all.market', { budget: yen(result.marketBudget) })}</p>
      <table class="table">
        <tr><th>${tr('result.col.team')}</th><th>${tr('result.col.price')}</th><th>${tr('result.col.sold')}</th><th>${tr('result.col.profit')}</th></tr>
        ${rows}
      </table>
    </div>
    ${options.onNext
      ? `<button class="btn" id="next" type="button">${esc(options.nextLabel ?? tr('solo.next'))}</button>`
      : `<p class="muted center">${tr('result.waitGm')}</p>`}`;
  if (options.onNext) container.querySelector('#next')!.addEventListener('click', options.onNext);
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
