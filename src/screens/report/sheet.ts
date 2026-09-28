// 結果シート（A4・1枚）：1年の振り返りを紙で配ったり、PDFで保存したりするためのページ。
// 画面の上に重ねて見せ、「印刷・PDFで保存」でブラウザの印刷を開く（PDFに保存はブラウザの機能を使う）。
// 数字と振り返りの中身は engine の termSummary / termFeedback。ここでは並べるだけ。

import { termSummary } from '../../engine/accounting';
import { termFeedback, type TermNote } from '../../engine/feedback';
import { rankTeams } from '../../engine/month';
import type { MonthResult, Recipe, TeamState } from '../../engine/types';
import { lang, t, type Key } from '../../i18n';
import { cpuLabel } from '../../i18n/content';
import { esc, monthShort, signedYen, yen } from '../../ui/format';

export interface SheetInput {
  results: MonthResult[];
  teams: TeamState[];
  meId: string;
  startFund: number;
  startCalendarMonth: number;
  recipe: Recipe;
  baristaCapacity: number;
  condition: { difficulty?: string; pattern?: string; teamCount: number; elimination: boolean }; // 表示用の文字
}

export function openResultSheet(input: SheetInput): void {
  document.querySelector('.sheet-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.innerHTML = `
    <div class="sheet-toolbar">
      <button class="btn" type="button" data-sheet-print>${t('sheet.print')}</button>
      <button class="btn secondary" type="button" data-sheet-close>${t('sheet.close')}</button>
      <p class="muted">${t('sheet.help')}</p>
    </div>
    <div class="sheet-scroll"><div class="sheet-page">${sheetHtml(input)}</div></div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('sheet-open');

  // スマホでは紙の幅に収まるよう縮めて見せる（印刷のときは縮めない）
  const page = overlay.querySelector<HTMLElement>('.sheet-page')!;
  const fit = () => { page.style.zoom = String(Math.min(1, (window.innerWidth - 24) / 760)); };
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
  const c = input.condition;

  const note = (n: TermNote) => {
    const p: Record<string, string | number> = { ...n.params };
    for (const k of ['profit', 'waste', 'revenue'] as const) if (k in n.params) p[k] = k === 'profit' ? signedYen(n.params[k]!) : yen(n.params[k]!);
    if ('month' in n.params) p.month = month(n.params.month!);
    return `<li>${t(`sheet.note.${n.id}` as Key, p)}</li>`;
  };
  const tile = (label: string, value: string, cls = '', extra = '') =>
    `<div class="s-tile ${cls}"><div class="s-tile-label">${label}</div>${extra}<div class="s-tile-value">${value}</div></div>`;

  return `
    <header class="s-head">
      <div>
        <div class="s-kicker">${t('sheet.kicker')}　<span class="s-url">lemonade-game-v2.web.app</span></div>
        <h1>${t('sheet.title')}</h1>
        <div class="s-cond">${t('sheet.cond', { d: esc(c.difficulty ?? '—'), p: esc(c.pattern ?? '—'), n: c.teamCount })}${c.elimination ? t('sheet.cond.elim') : ''}</div>
      </div>
      <div class="s-write">
        <div>${t('sheet.date')}</div>
        <div>${t('sheet.name')}<span class="s-line"></span></div>
      </div>
    </header>

    <section class="s-tiles">
      ${tile(t('sheet.tile.gain'), signedYen(s.totalProfit), 'hero', `<span class="s-badge">${t(`sheet.badge.${fb.title}` as Key)}</span>`)}
      ${tile(t('sheet.tile.sales'), yen(s.totalRevenue))}
      ${tile(t('sheet.tile.cost'), yen(s.totalMaterialCost + s.totalLaborCost))}
      ${tile(t('sheet.tile.final', { s: yen(input.startFund) }), yen(me.balance), me.balance < 0 ? 'neg' : '')}
      ${tile(t('sheet.tile.rank'), t('sheet.tile.rankValue', { rank, n: input.teams.length }))}
    </section>

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
        <td class="${(fb.missedByMonth[r.month] ?? 0) > 0 ? 'warn' : ''}">${fb.missedByMonth[r.month] ?? 0}</td>
        <td>${yen(r.revenue)}</td><td>${yen(r.materialCost + r.laborCost)}</td>
        <td class="${r.profit >= 0 ? 'pos' : 'neg'}">${signedYen(r.profit)}</td></tr>`).join('')}
      <tr class="sum"><td>${t('sheet.total')}</td><td></td><td></td><td></td>
        <td>${s.totalOffered}</td><td>${s.totalSold}</td><td>${s.totalUnsold}</td><td>${fb.totalMissed}</td>
        <td>${yen(s.totalRevenue)}</td><td>${yen(s.totalMaterialCost + s.totalLaborCost)}</td>
        <td class="${s.totalProfit >= 0 ? 'pos' : 'neg'}">${signedYen(s.totalProfit)}</td></tr>
    </table>

    <h2>${t('sheet.feedback')}</h2>
    <p class="s-style"><strong>🧭 ${t('sheet.style', { style: esc(cpuLabel(fb.style)) })}</strong>　${t(`sheet.styleDesc.${fb.style}` as Key)}</p>
    <div class="s-boxes">
      <div class="s-box good"><h3>👍 ${t('sheet.good')}</h3><ul>${fb.good.map(note).join('')}</ul></div>
      <div class="s-box next"><h3>🎯 ${t('sheet.next')}</h3><ul>${fb.next.map(note).join('')}</ul></div>
    </div>

    <h2>${t('sheet.reflect')}</h2>
    ${(['sheet.q1', 'sheet.q2', 'sheet.q3', 'sheet.q4', 'sheet.q5'] as const).map((q) => `<div class="s-q">${t(q)}</div><div class="s-answer"></div>`).join('')}`;
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
