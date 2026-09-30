// 月の結果（ソロモード）：上から順に読む「結果のストーリー」。
//   ① 今月の市場：お客さんのお金の帯（安いお店から順）と、みんなの結果の表（帯と同じ色）、のがした売上
//   ② あなたのお店：作った杯数を、売れた・売れ残りで色分け
//   ③ お金の流れ：売上の棒と、材料費＋人件費を積み上げた費用の棒 → もうけ（赤字）、資金（先月 → 来月）
//   ④ ひとこと
// 結果発表の演出つき（スキップできる。「演出なし」はブラウザに覚える。動きを減らす設定の端末では出さない）。
// 数字はすべて engine の結果と monthInsights。ここでは並べるだけ。

import { missedCups, moneyFlow, monthInsights, type Insight } from '../../engine/feedback';
import type { MonthResult, Recipe } from '../../engine/types';
import { t, type Key } from '../../i18n';
import type { TeamSlot } from '../../sync/schema';
import { esc, signedYen, yen } from '../../ui/format';
import { isWatching } from './result-view';

export interface StoryOptions {
  recipe: Recipe;
  baristaCapacity: number;
  previous?: MonthResult; // 先月の結果（お客さんのお金の増減を言うため）
  eliminated?: Record<string, string>; // 前の月までに脱落したお店と、脱落した月の表示
  onNext: () => void;
  nextLabel: string;
}

const REVEAL_KEY = 'lemonade-reveal';
const PER_ROW = 25;
const UNITS = [1, 2, 5, 10, 20, 50, 100];
const MAX_ICONS = PER_ROW * 4;
const MAX_NOTES = 3;
const MONEY_KEYS = ['balance', 'wages', 'revenue', 'waste', 'cheapest', 'price', 'material', 'budget'];

// 演出の時間（ミリ秒）
const T_SEG = 350; // 市場の帯：1つのお店あたり
const T_CUPS = 900; // 杯の絵：ぜんぶで
const T_BAR = 300; // お金の流れ：1本あたり

function revealOn(): boolean {
  try {
    if (localStorage.getItem(REVEAL_KEY) === 'off') return false;
  } catch {
    // 保存できない環境では、演出ありのまま
  }
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setRevealOff(off: boolean): void {
  try {
    if (off) localStorage.setItem(REVEAL_KEY, 'off');
    else localStorage.removeItem(REVEAL_KEY);
  } catch {
    // 何もしない
  }
}

// ① 今月の市場（帯とみんなの結果の表）。入力画面の「先月の市場」でも使う。
// end：帯の演出が終わる時刻（ms）。演出は .story.reveal の中だけで動く
export function marketSection(
  result: MonthResult,
  teamId: string,
  teams: Record<string, TeamSlot>,
  opts: { eliminated?: Record<string, string>; title?: string } = {},
): { html: string; end: number } {
  const me = result.teamResults.find((x) => x.teamId === teamId);
  const budget = Math.max(1, result.marketBudget);
  const color = (id: string) => `var(--series-${((teams[id]?.order ?? 0) % 8) + 1})`;
  const pct = (v: number) => (v / budget) * 100;
  const name = (id: string) => esc(teams[id]?.name ?? id);
  // 表の中では「🤖」を別にしておく（スマホでは幅が足りないので隠す）
  const tableName = (id: string) => name(id).replace(/^🤖\s*/, '<span class="robot">🤖 </span>');

  // ① 市場：安いお店から順（同じ値段は提出順ではなく並び順）。売っていないお店は最後
  const ordered = [...result.teamResults].sort((a, b) =>
    (a.offered > 0 ? 0 : 1) - (b.offered > 0 ? 0 : 1) || a.price - b.price || (teams[a.teamId]?.order ?? 0) - (teams[b.teamId]?.order ?? 0));
  const flow = moneyFlow(result);
  let delay = 0;
  const segs = ordered.filter((x) => x.revenue > 0).map((x) => {
    const d = delay;
    delay += T_SEG;
    const p = pct(x.revenue);
    return `<span class="seg${x.teamId === teamId ? ' me' : ''}" style="width:${p.toFixed(2)}%;background:${color(x.teamId)};--d:${d}ms">${p >= 9 ? `${Math.round(p)}%` : ''}</span>`;
  });
  if (flow.unspent > 0) {
    const p = pct(flow.unspent);
    segs.push(`<span class="seg unspent" style="width:${p.toFixed(2)}%;--d:${delay}ms">${p >= 9 ? `${Math.round(p)}%` : ''}</span>`);
    delay += T_SEG;
  }
  const marketEnd = delay;
  const rowDelay = new Map(ordered.filter((x) => x.revenue > 0).map((x, i) => [x.teamId, i * T_SEG]));
  const outBadge = ` <span class="badge bad">${t('result.outBadge')}</span>`;
  const rows = ordered.map((x) => `<tr class="${x.teamId === teamId ? 'me' : ''}" style="--d:${rowDelay.get(x.teamId) ?? 0}ms">
      <td><i class="dot" style="background:${color(x.teamId)}"></i>${tableName(x.teamId)}${x.eliminated ? outBadge : ''}</td>
      <td>${x.offered === 0 ? (isWatching(x) ? t('result.sat') : '—') : yen(x.price)}</td>
      <td>${x.sold}/${x.offered}</td>
      <td>${yen(x.revenue)}</td>
      <td class="share">${x.revenue > 0 ? `${Math.round(pct(x.revenue))}%` : '—'}</td>
      <td class="${x.profit >= 0 ? 'good' : 'bad'}">${signedYen(x.profit)}</td></tr>`).join('')
    + (flow.unspent > 0 ? `<tr class="unspent-row" style="--d:${marketEnd - T_SEG}ms"><td colspan="3"><i class="dot unspent"></i>${t('story.unspent')}</td>
      <td>${yen(flow.unspent)}</td><td class="share">${Math.round(pct(flow.unspent))}%</td><td></td></tr>` : '')
    + Object.entries(opts.eliminated ?? {})
      .filter(([id]) => !result.teamResults.some((x) => x.teamId === id))
      .map(([id, m]) => `<tr class="out"><td>${name(id)}</td><td colspan="5" class="muted">${t('result.outSince', { m })}</td></tr>`).join('');
  const missed = me ? missedCups(result, teamId) : 0;
  const html = `<section class="card story-market">
      <h2>${opts.title ?? t('story.market.h2')} <span class="muted">${t('story.market.budget', { v: yen(result.marketBudget) })}</span></h2>
      <p class="muted story-rule">${t('story.market.rule')}</p>
      <div class="market-bar" role="img" aria-label="${esc(t('story.market.budget', { v: yen(result.marketBudget) }))}">${segs.join('')}</div>
      <div class="table-scroll"><table class="table story-table">
        <tr><th>${t('story.col.stand')}</th><th>${t('story.col.price')}</th><th>${t('story.col.sold')}</th><th>${t('story.col.sales')}</th><th class="share">${t('story.col.share')}</th><th>${t('story.col.profit')}</th></tr>
        ${rows}
      </table></div>
      ${me && missed > 0 ? `<div class="missed-box" style="--d:${marketEnd}ms"><strong>${t('story.missed', { v: yen(missed * me.price) })}</strong>
        <div class="muted">${t('story.missed.detail', { u: yen(flow.unspent), p: yen(me.price), n: missed })}</div></div>` : ''}
    </section>`;

  return { html, end: marketEnd };
}

export function renderMonthStory(
  container: HTMLElement,
  result: MonthResult,
  teamId: string,
  teams: Record<string, TeamSlot>,
  opts: StoryOptions,
): void {
  const me = result.teamResults.find((x) => x.teamId === teamId);
  const ins = monthInsights(result, teamId, opts.recipe, opts.baristaCapacity, opts.previous);
  if (!me || !ins) {
    container.innerHTML = `<div class="card">${t('result.none')}</div>`;
    return;
  }
  const { html: market, end: marketEnd } = marketSection(result, teamId, teams, { ...(opts.eliminated ? { eliminated: opts.eliminated } : {}) });
  // ② あなたのお店：作った杯数（売れた＝緑、売れ残り＝灰色）
  const cupStart = marketEnd + 200;
  let shopBody: string;
  if (me.offered > 0) {
    const unit = UNITS.find((u) => me.offered / u <= MAX_ICONS) ?? UNITS[UNITS.length - 1]!;
    const soldIcons = Math.round(me.sold / unit);
    const total = Math.ceil(me.offered / unit);
    const step = Math.min(30, T_CUPS / Math.max(1, total));
    const icons = Array.from({ length: total }, (_, i) =>
      `<i class="cup ${i < soldIcons ? 'sold' : 'unsold'}" style="--d:${Math.round(cupStart + i * step)}ms"></i>`).join('');
    const material = result.prices.lemon * opts.recipe.lemon + result.prices.sugar * opts.recipe.sugar;
    shopBody = `<p class="story-made">${t('story.shop.made', { n: me.offered })}</p>
      <div class="cup-grid" aria-hidden="true">${icons}</div>
      <div class="cup-legend"><span><i class="cup sold"></i>${t('story.shop.sold')} ${me.sold}</span><span><i class="cup unsold"></i>${t('story.shop.unsold')} ${me.unsold}</span>
        ${unit > 1 ? `<span class="muted">${t('story.shop.unit', { n: unit, row: unit * PER_ROW })}</span>` : ''}</div>
      <p class="story-line">${t('story.shop.salesLine', { n: me.sold, p: yen(me.price), r: `<strong>${yen(me.revenue)}</strong>` })}</p>
      ${me.unsold > 0 ? `<p class="story-line bad">${t('story.shop.unsoldLine', { n: me.unsold, w: yen(me.unsold * material) })}</p>` : ''}`;
  } else {
    shopBody = `<p>${isWatching(me) ? t('result.watched') : t('result.noCups')}</p>`;
  }
  const shop = `<section class="card story-shop"><h2>${t('story.shop.h2')}</h2>${shopBody}</section>`;

  // ③ お金の流れ：売上の棒と、材料費＋人件費を積み上げた費用の棒を、同じ目盛りで並べる。
  // 黒字なら費用の棒のあとに「もうけ」（売上との差）、赤字なら売上の線をはみ出した分が「赤字」
  const barStart = cupStart + (me.offered > 0 ? T_CUPS + 200 : 0);
  const material = me.costLemon + me.costSugar;
  const labor = me.costBarista;
  const cost = material + labor;
  const scale = Math.max(1, me.revenue, cost);
  const w = (v: number) => `${((Math.max(0, v) / scale) * 100).toFixed(2)}%`;
  const inside = (v: number, label: string) => (v / scale >= 0.18 ? label : '');
  const profitWord = me.profit >= 0 ? t('story.money.profitWord') : t('story.money.lossWord');
  const before = me.balance - me.profit;
  const balanceAt = barStart + 3 * T_BAR;
  const money = `<section class="card story-money"><h2>${t('story.money.h2')}</h2>
      <div class="pl-row" style="--d:${barStart}ms">
        <span class="pl-label">${t('story.money.sales')}</span>
        <span class="pl-track"><span class="pl-seg sales" style="width:${w(me.revenue)}">${inside(me.revenue, t('story.money.sales'))}</span></span>
        <span class="pl-value plus">${yen(me.revenue)}</span>
      </div>
      <div class="pl-row" style="--d:${barStart + T_BAR}ms">
        <span class="pl-label">${t('story.money.cost')}</span>
        <span class="pl-track">
          <span class="pl-seg material" style="width:${w(material)}">${inside(material, t('story.money.materialShort'))}</span><span class="pl-seg labor" style="width:${w(labor)}">${inside(labor, t('story.money.laborShort'))}</span>${me.profit > 0
            ? `<span class="pl-seg profit" style="width:${w(me.profit)}">${inside(me.profit, profitWord)}</span>` : ''}
          ${me.profit < 0 ? `<span class="pl-loss" style="left:${w(me.revenue)};width:${w(-me.profit)}" title="${esc(profitWord)}"></span>
            <span class="pl-line" style="left:${w(me.revenue)}"></span>` : ''}
        </span>
        <span class="pl-value minus">−${yen(cost)}</span>
      </div>
      <p class="pl-legend"><i class="material"></i>${t('story.money.costLine', {
        m: `${t('story.money.materialShort')} ${yen(material)}`, l: `<i class="labor"></i>${t('story.money.laborShort')} ${yen(labor)}`, c: yen(cost),
      })}</p>
      <p class="pl-result ${me.profit >= 0 ? 'plus' : 'minus'}" style="--d:${barStart + 2 * T_BAR}ms">
        <span>${t('story.money.result', { r: yen(me.revenue), c: yen(cost) })}</span>
        <strong>${profitWord} ${signedYen(me.profit)}</strong></p>
      <p class="story-balance" style="--d:${balanceAt}ms">${t('story.money.balance')} ${yen(before)} → <strong class="num" data-count-from="${before}" data-count-to="${me.balance}">${yen(me.balance)}</strong>
        <span class="muted">（${t('story.money.next')}）</span></p>
      <p class="muted" style="margin:4px 0 0">${t('result.carry', { l: me.stock.lemon, s: me.stock.sugar })}</p>
    </section>`;

  // ④ ひとこと（のがした売上は①に出したので、ここでは出さない）
  const notes = ins.notes.filter((n) => n.id !== 'soldOutMissed').slice(0, MAX_NOTES);
  const notesAt = balanceAt + 500;
  const noteHtml = (n: Insight) => {
    const p: Record<string, string | number> = { ...n.params };
    for (const k of MONEY_KEYS) if (k in n.params) p[k] = yen(n.params[k]!);
    if ('profit' in n.params) p.profit = signedYen(n.params.profit!);
    return `<li>${t(`insight.${n.id}` as Key, p)}</li>`;
  };

  const reveal = revealOn();
  container.innerHTML = `<div class="story${reveal ? ' reveal' : ''}">
    ${reveal ? `<div class="story-skip"><button type="button" class="small" id="skip">${t('story.skip')}</button></div>` : ''}
    ${me.eliminated ? `<div class="notice bad-notice story-notice">${t('result.youOut')}</div>` : ''}
    ${market}
    ${shop}
    ${money}
    ${notes.length > 0 ? `<section class="card story-notes" style="--d:${notesAt}ms"><h2>${t('story.notes.h2')}</h2><ul class="insights">${notes.map(noteHtml).join('')}</ul></section>` : ''}
    <div class="result-next">
      <button class="btn" id="next" type="button">${esc(opts.nextLabel)}</button>
      <label class="check story-off"><input type="checkbox" id="revealOff" ${reveal ? '' : 'checked'}> ${t('story.off')}</label>
    </div>
  </div>`;

  const story = container.querySelector<HTMLElement>('.story')!;
  const countEl = story.querySelector<HTMLElement>('[data-count-to]')!;
  let raf = 0;
  let endTimer = 0;
  const finish = () => {
    story.classList.remove('reveal');
    story.querySelector('.story-skip')?.remove();
    cancelAnimationFrame(raf);
    window.clearTimeout(endTimer);
    countEl.textContent = yen(me.balance);
  };
  if (reveal) {
    // 資金のカウントアップ
    const from = before;
    const to = me.balance;
    const startAt = performance.now() + balanceAt;
    countEl.textContent = yen(from);
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - startAt) / 600));
      countEl.textContent = yen(Math.round(from + (to - from) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    endTimer = window.setTimeout(finish, notesAt + 600);
    story.querySelector('#skip')!.addEventListener('click', finish);
  }
  story.querySelector('#next')!.addEventListener('click', () => { finish(); opts.onNext(); });
  story.querySelector<HTMLInputElement>('#revealOff')!.addEventListener('change', (e) => {
    const off = (e.target as HTMLInputElement).checked;
    setRevealOff(off);
    if (off) finish();
  });
}
