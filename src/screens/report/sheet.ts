// 年次決算レポート（A4・1枚）：1年の振り返りを紙で配ったり、PDFで保存したりするためのページ。
// 2年以上のときは、年ごとの1枚と、通算のまとめ1枚をまとめて出せる。
// 画面の上に重ねて見せ、「印刷・PDFで保存」でブラウザの印刷を開く（PDFに保存はブラウザの機能を使う）。
// 数字と振り返りの中身は engine の termSummary / termFeedback / yearlySummary。ここでは並べるだけ。

import { termSummary } from '../../engine/accounting';
import { termFeedback, type TermFeedback, type TermNote } from '../../engine/feedback';
import { rankTeams } from '../../engine/month';
import type { MonthResult, Recipe, TeamState } from '../../engine/types';
import type { TitleId } from '../../engine/titles';
import { yearlySummary, yearOf } from '../../engine/years';
import { lang, t, type Key } from '../../i18n';
import { cpuLabel } from '../../i18n/content';
import { esc, monthShort, signedYen, yen } from '../../ui/format';
import { titleChip } from '../../ui/titles';

type Condition = { difficulty?: string; pattern?: string; teamCount: number; elimination: boolean }; // 表示用の文字

export interface SheetInput {
  results: MonthResult[]; // この年の月の結果
  teams: TeamState[]; // この年の終わりの時点の各お店（資金・脱落）
  meId: string;
  startFund: number; // この年のはじめの資金（1年目なら元手）
  startCalendarMonth: number;
  recipe: Recipe;
  baristaCapacity: number;
  condition: Condition;
  year?: number; // 何年目のシートか（2年以上のときだけ）
  titles?: TitleId[]; // この年の肩書き（表示の順）
}

export interface SummaryInput {
  results: MonthResult[]; // すべての年の月の結果
  teams: TeamState[]; // 最後の時点の各お店
  meId: string;
  startFund: number; // 元手
  startCalendarMonth: number;
  recipe: Recipe;
  baristaCapacity: number;
  condition: Condition;
  years: number;
  titles?: TitleId[]; // 全期間で集めた肩書き
}

// 1枚だけ
export function openResultSheet(input: SheetInput): void {
  openSheets([sheetHtml(input)]);
}

// 何枚かをまとめて（印刷すると1枚ずつ別のページになる）
export function openSheets(pages: string[]): void {
  document.querySelector('.sheet-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet-toolbar">
      <button class="btn" type="button" data-sheet-print>${t('sheet.print')}</button>
      <button class="btn secondary" type="button" data-sheet-close>${t('sheet.close')}</button>
      <p class="muted">${t('sheet.help')}</p>
    </div>
    <div class="sheet-scroll">${pages.map((p) => `<div class="sheet-page">${p}</div>`).join('')}</div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('sheet-open');

  // スマホでは紙の幅に収まるよう縮めて見せる（印刷のときは縮めない）
  const fit = () => {
    const zoom = String(Math.min(1, (window.innerWidth - 24) / 760));
    overlay.querySelectorAll<HTMLElement>('.sheet-page').forEach((page) => { page.style.zoom = zoom; });
  };
  fit();
  window.addEventListener('resize', fit);

  const close = () => {
    window.removeEventListener('resize', fit);
    overlay.remove();
    document.body.classList.remove('sheet-open');
  };
  overlay.querySelector('[data-sheet-close]')!.addEventListener('click', close);
  overlay.querySelector('[data-sheet-print]')!.addEventListener('click', () => window.print());
  window.addEventListener('hashchange', close, { once: true });
}

// ---- 共通の部品 ----

const tileHtml = (label: string, value: string, cls = '', extra = '') =>
  `<div class="s-tile ${cls}"><div class="s-tile-label">${label}</div>${extra}<div class="s-tile-value">${value}</div></div>`;

function headerHtml(kicker: string, title: string, c: Condition): string {
  return `<header class="s-head">
      <div>
        <div class="s-kicker">${kicker}</div>
        <h1>${title}</h1>
        <div class="s-cond">${t('sheet.cond', { d: esc(c.difficulty ?? '—'), p: esc(c.pattern ?? '—'), n: c.teamCount })}${c.elimination ? t('sheet.cond.elim') : ''}</div>
      </div>
      <div class="s-sign">
        <span class="s-sign-label">${t('sheet.sign.date')}</span><span class="s-fill">${t('sheet.sign.dateBlank')}</span>
        <span class="s-sign-label">${t('sheet.sign.store')}</span><span class="s-fill"></span>
        <span class="s-sign-label">${t('sheet.sign.manager')}</span><span class="s-fill"></span>
      </div>
    </header>`;
}

// years：通算のまとめのとき（「1年で」ではなく「2年で」と書く）
function feedbackHtml(fb: TermFeedback, month: (m: number) => string, years?: number): string {
  const note = (n: TermNote) => {
    const p: Record<string, string | number> = { ...n.params };
    if (years && n.id === 'profit') return `<li>${t('sheet.note.profitYears', { n: years, profit: signedYen(n.params.profit!) })}</li>`;
    for (const k of ['profit', 'waste', 'revenue'] as const) if (k in n.params) p[k] = k === 'profit' ? signedYen(n.params[k]!) : yen(n.params[k]!);
    if ('month' in n.params) p.month = month(n.params.month!);
    return `<li>${t(`sheet.note.${n.id}` as Key, p)}</li>`;
  };
  return `<h2>${t('sheet.feedback')}</h2>
    <p class="s-style"><strong>🧭 ${t('sheet.style', { style: esc(cpuLabel(fb.style)) })}</strong>　${t(`sheet.styleDesc.${fb.style}` as Key)}</p>
    <div class="s-boxes">
      <div class="s-box good"><h3>👍 ${t('sheet.good')}</h3><ul>${fb.good.map(note).join('')}</ul></div>
      <div class="s-box next"><h3>🎯 ${t('sheet.next')}</h3><ul>${fb.next.map(note).join('')}</ul></div>
    </div>`;
}

function reflectHtml(prefix: 'sheet' | 'sheet.summary', tall = false): string {
  return `<h2>${t('sheet.reflect')}</h2>
    <div class="s-reflect">
      ${[1, 2, 3].map((i) => `<div class="s-answer${tall ? ' tall' : ''}">
        <div class="s-q"><span class="s-num">${i}</span>${t(`${prefix}.q${i}` as Key)}<span class="s-hint">${t(`${prefix}.q${i}.hint` as Key)}</span></div>
      </div>`).join('')}
    </div>
    <footer class="s-foot">${t('sheet.footer')}</footer>`;
}

// ---- 1年の1枚 ----

export function sheetHtml(input: SheetInput): string {
  const { results, meId } = input;
  const s = termSummary(results, meId, input.recipe);
  const me = input.teams.find((tm) => tm.teamId === meId)!;
  const ranked = rankTeams(input.teams);
  const rank = ranked.findIndex((tm) => tm.teamId === meId) + 1;
  const fb = termFeedback(results, meId, input.recipe, input.baristaCapacity, {
    rank, teamCount: input.teams.length, ...(me.eliminatedMonth !== undefined ? { eliminatedMonth: me.eliminatedMonth } : {}),
  });
  const month = (m: number) => monthShort(m, input.startCalendarMonth);
  const baristaByMonth = new Map(results.map((r) => [r.month, r.teamResults.find((x) => x.teamId === meId)?.baristaCount ?? 0]));
  const year = input.year;

  return `
    ${headerHtml(t('sheet.kicker'), year ? t('sheet.titleYear', { y: year }) : t('sheet.title'), input.condition)}

    <section class="s-tiles">
      ${tileHtml(t('sheet.tile.gain'), signedYen(s.totalProfit), 'hero')}
      ${tileHtml(t('sheet.tile.sales'), yen(s.totalRevenue))}
      ${tileHtml(t('sheet.tile.cost'), yen(s.totalMaterialCost + s.totalLaborCost))}
      ${tileHtml(t(year ? 'sheet.tile.yearEnd' : 'sheet.tile.final', { s: yen(input.startFund) }), yen(me.balance), me.balance < 0 ? 'neg' : '')}
      ${tileHtml(t('sheet.tile.rank'), t('sheet.tile.rankValue', { rank, n: input.teams.length }))}
    </section>
    ${input.titles && input.titles.length > 0 ? `<div class="s-titles"><span class="s-titles-label">🏅 ${t('sheet.titles')}</span>${input.titles.map((id) => titleChip(id, 's-chip')).join('')}</div>` : ''}

    <h2>${t('sheet.chart')}</h2>
    <div class="s-chart">${profitBars(s.rows.map((r) => ({ label: month(r.month), value: r.profit })))}</div>

    <h2>${t('sheet.table')}</h2>
    <table class="s-table">
      <tr><th>${t('sheet.th.month')}</th><th>${t('sheet.th.market')}</th><th>${t('sheet.th.price')}</th><th>${t('sheet.th.barista')}</th>
        <th>${t('sheet.th.made')}</th><th>${t('sheet.th.sold')}</th><th>${t('sheet.th.unsold')}</th><th>${t('sheet.th.missed')}</th>
        <th>${t('sheet.th.sales')}</th><th>${t('sheet.th.cost')}</th><th>${t('sheet.th.profit')}</th></tr>
      ${s.rows.map((r) => `<tr>
        <td>${month(r.month)}</td><td>${yen(r.marketBudget)}</td><td>${r.offered === 0 ? '—' : yen(r.price)}</td>
        <td>${t('sheet.people', { n: baristaByMonth.get(r.month) ?? 0 })}</td>
        <td>${r.offered}</td><td>${r.sold}</td><td class="${r.unsold > 0 ? 'neg' : ''}">${r.unsold}</td>
        <td class="${(fb.missedRevenueByMonth[r.month] ?? 0) > 0 ? 'warn' : ''}">${yen(fb.missedRevenueByMonth[r.month] ?? 0)}</td>
        <td>${yen(r.revenue)}</td><td>${yen(r.materialCost + r.laborCost)}</td>
        <td class="${r.profit >= 0 ? 'pos' : 'neg'}">${signedYen(r.profit)}</td></tr>`).join('')}
      <tr class="sum"><td>${t('sheet.total')}</td><td></td><td></td><td></td>
        <td>${s.totalOffered}</td><td>${s.totalSold}</td><td>${s.totalUnsold}</td><td>${yen(fb.totalMissedRevenue)}</td>
        <td>${yen(s.totalRevenue)}</td><td>${yen(s.totalMaterialCost + s.totalLaborCost)}</td>
        <td class="${s.totalProfit >= 0 ? 'pos' : 'neg'}">${signedYen(s.totalProfit)}</td></tr>
    </table>

    ${feedbackHtml(fb, month)}
    ${reflectHtml('sheet')}`;
}

// ---- 通算のまとめ1枚（2年以上） ----

export function summarySheetHtml(input: SummaryInput): string {
  const { results, meId } = input;
  const rows = yearlySummary(results, input.teams, meId, input.recipe, input.startFund);
  const me = input.teams.find((tm) => tm.teamId === meId)!;
  const rank = rankTeams(input.teams).findIndex((tm) => tm.teamId === meId) + 1;
  const fb = termFeedback(results, meId, input.recipe, input.baristaCapacity, {
    rank, teamCount: input.teams.length, ...(me.eliminatedMonth !== undefined ? { eliminatedMonth: me.eliminatedMonth } : {}),
  });
  const month = (m: number) => t('sheet.monthOfYear', { y: yearOf(m), m: monthShort(m, input.startCalendarMonth) });
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0);
  const n = input.years;

  return `
    ${headerHtml(t('sheet.summary.kicker'), t('sheet.summary.title', { n }), input.condition)}

    <section class="s-tiles">
      ${tileHtml(t('sheet.summary.tile.gain', { n }), signedYen(sum((r) => r.profit)), 'hero')}
      ${tileHtml(t('sheet.summary.tile.sales'), yen(sum((r) => r.revenue)))}
      ${tileHtml(t('sheet.summary.tile.cost'), yen(sum((r) => r.cost)))}
      ${tileHtml(t('sheet.tile.final', { s: yen(input.startFund) }), yen(me.balance), me.balance < 0 ? 'neg' : '')}
      ${tileHtml(t('sheet.summary.tile.rank'), t('sheet.tile.rankValue', { rank, n: input.teams.length }))}
    </section>
    ${input.titles && input.titles.length > 0 ? `<div class="s-titles"><span class="s-titles-label">🏅 ${t('sheet.summary.titles')}</span>${input.titles
    .map((id) => titleChip(id, 's-chip')).join('')}</div>` : ''}

    <h2>${t('sheet.summary.chart')}</h2>
    <div class="s-chart">${profitBars(rows.map((r) => ({ label: t('years.label', { y: r.year }), value: r.profit })))}</div>

    <h2>${t('sheet.summary.table')}</h2>
    <table class="s-table">
      <tr><th>${t('years.th.year')}</th><th>${t('years.th.sales')}</th><th>${t('years.th.cost')}</th><th>${t('years.th.profit')}</th>
        <th>${t('years.th.end')}</th><th>${t('years.th.rank')}</th><th>${t('sheet.th.sold')}</th><th>${t('sheet.th.unsold')}</th><th>${t('sheet.th.missed')}</th></tr>
      ${rows.map((r) => `<tr>
        <td>${t('years.label', { y: r.year })}</td><td>${yen(r.revenue)}</td><td>${yen(r.cost)}</td>
        <td class="${r.profit >= 0 ? 'pos' : 'neg'}">${signedYen(r.profit)}</td><td class="${r.endBalance < 0 ? 'neg' : ''}">${yen(r.endBalance)}</td>
        <td>${t('sheet.tile.rankValue', { rank: r.rank, n: input.teams.length })}</td>
        <td>${r.sold}</td><td class="${r.unsold > 0 ? 'neg' : ''}">${r.unsold}</td><td class="${r.missedRevenue > 0 ? 'warn' : ''}">${yen(r.missedRevenue)}</td></tr>`).join('')}
      <tr class="sum"><td>${t('sheet.total')}</td><td>${yen(sum((r) => r.revenue))}</td><td>${yen(sum((r) => r.cost))}</td>
        <td class="${sum((r) => r.profit) >= 0 ? 'pos' : 'neg'}">${signedYen(sum((r) => r.profit))}</td><td>${yen(me.balance)}</td>
        <td>${t('sheet.tile.rankValue', { rank, n: input.teams.length })}</td>
        <td>${sum((r) => r.sold)}</td><td>${sum((r) => r.unsold)}</td><td>${yen(sum((r) => r.missedRevenue))}</td></tr>
    </table>

    ${feedbackHtml(fb, month, n)}
    ${reflectHtml('sheet.summary', true)}`;
}

// 毎月の利益の棒（紙に合わせた固定の大きさ・色）。値を棒の上下に書く
function profitBars(items: { label: string; value: number }[]): string {
  if (items.length === 0) return '';
  const W = 700;
  const H = 98;
  const top = 16;
  const bottom = 18;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const hasNeg = items.some((i) => i.value < 0);
  const hasPos = items.some((i) => i.value > 0);
  // 0円の線の位置：プラスだけなら下、マイナスだけなら上、両方なら値の大きさで分ける
  const posMax = Math.max(0, ...items.map((i) => i.value));
  const negMax = Math.max(0, ...items.map((i) => -i.value));
  const ih = H - top - bottom - 24;
  const zero = top + 12 + (hasPos && hasNeg ? (posMax / (posMax + negMax)) * ih : hasNeg ? 0 : ih);
  const scale = ih / (hasPos && hasNeg ? posMax + negMax : max);
  const slot = W / items.length;
  const bw = Math.min(34, slot * 0.6);
  const short = (v: number) => {
    const a = Math.abs(v);
    const s = a >= 10000 ? `${(a / 10000).toFixed(a >= 100000 ? 0 : 1)}万` : a.toLocaleString('ja-JP');
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`;
  };
  const en = lang() === 'en';
  const shortEn = (v: number) => {
    const a = Math.abs(v);
    const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 100000 ? 0 : 1)}k` : String(a);
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}`;
  };
  const bars = items.map((it, i) => {
    const cx = slot * i + slot / 2;
    const h = Math.max(1, Math.abs(it.value) * scale);
    const y = it.value >= 0 ? zero - h : zero;
    const ty = it.value >= 0 ? y - 3 : y + h + 10;
    return `<rect x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="3" class="${it.value >= 0 ? 'pos' : 'neg'}"/>
      <text x="${cx}" y="${ty}" text-anchor="middle" class="val ${it.value >= 0 ? 'pos' : 'neg'}">${en ? shortEn(it.value) : short(it.value)}</text>
      <text x="${cx}" y="${H - 4}" text-anchor="middle" class="lab">${esc(it.label)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(t('sheet.chart'))}">
    <line x1="0" x2="${W}" y1="${zero}" y2="${zero}" class="zero"/>${bars}</svg>`;
}
