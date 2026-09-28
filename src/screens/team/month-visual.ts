// 月の結果の「今月のお客さん」：売れた・売れ残り・売り逃しの杯数を絵で、お客さんのお金の行き先を帯で見せ、短いコメントを添える。
// 数字とコメントの選び方は engine の monthInsights。ここでは並べるだけ。

import { monthInsights, type Insight } from '../../engine/feedback';
import type { MonthResult, Recipe } from '../../engine/types';
import { t, type Key } from '../../i18n';
import type { TeamSlot } from '../../sync/schema';
import { esc, signedYen, yen } from '../../ui/format';

export interface VisualContext {
  recipe: Recipe;
  baristaCapacity: number;
  previous?: MonthResult; // 先月の結果（お客さんのお金の増減を言うため）
}

// 絵の数が多くなりすぎないよう、1つで何杯を表すかを決める（60個まで）
const UNITS = [1, 2, 5, 10, 20, 50, 100];
const MAX_ICONS = 60;
// 画面に出すコメントの数
const MAX_NOTES = 4;
const MONEY_KEYS = ['balance', 'wages', 'revenue', 'waste', 'cheapest', 'price', 'material', 'budget'];

export function monthVisualHtml(result: MonthResult, teamId: string, teams: Record<string, TeamSlot>, ctx: VisualContext): string {
  const ins = monthInsights(result, teamId, ctx.recipe, ctx.baristaCapacity, ctx.previous);
  const me = result.teamResults.find((x) => x.teamId === teamId);
  if (!ins || !me) return '';

  const total = me.sold + me.unsold + ins.missed;
  const unit = UNITS.find((u) => total / u <= MAX_ICONS) ?? UNITS[UNITS.length - 1]!;
  const icons = (n: number, cls: string) => `<i class="cup ${cls}"></i>`.repeat(Math.ceil(n / unit));
  const cups = total > 0
    ? `<div class="cups" aria-hidden="true">${icons(me.sold, 'sold')}${icons(me.unsold, 'unsold')}${icons(ins.missed, 'missed')}</div>
      <div class="cup-legend">
        <span><i class="cup sold"></i>${t('visual.sold')}</span><span><i class="cup unsold"></i>${t('visual.unsold')}</span>
        <span><i class="cup missed"></i>${t('visual.missed')}</span>${unit > 1 ? `<span class="muted">${t('visual.unit', { n: unit })}</span>` : ''}
      </div>
      <p style="margin:6px 0 0">${t('visual.summary', { sold: me.sold, unsold: me.unsold, missed: ins.missed })}</p>`
    : '';

  // お客さんのお金の行き先（お店の並び順＝グラフの色の順。使われなかったお金は最後）
  const budget = Math.max(1, result.marketBudget);
  const segs = [...ins.flow.byTeam]
    .filter((x) => x.revenue > 0)
    .sort((a, b) => (teams[a.teamId]?.order ?? 0) - (teams[b.teamId]?.order ?? 0));
  const pct = (v: number) => `${((v / budget) * 100).toFixed(2)}%`;
  const color = (id: string) => `var(--series-${((teams[id]?.order ?? 0) % 8) + 1})`;
  const flow = `
    <p class="flow-title">${t('visual.flow', { budget: yen(result.marketBudget) })}</p>
    <div class="flow-bar" role="img" aria-label="${esc(t('visual.flow', { budget: yen(result.marketBudget) }))}">
      ${segs.map((x) => `<span class="flow-seg${x.teamId === teamId ? ' me' : ''}" style="width:${pct(x.revenue)};background:${color(x.teamId)}"></span>`).join('')}
      ${ins.flow.unspent > 0 ? `<span class="flow-seg unspent" style="width:${pct(ins.flow.unspent)}"></span>` : ''}
    </div>
    <div class="flow-legend">
      ${segs.map((x) => `<span class="${x.teamId === teamId ? 'me' : ''}"><i style="background:${color(x.teamId)}"></i>${esc(teams[x.teamId]?.name ?? x.teamId)} ${yen(x.revenue)}</span>`).join('')}
      ${ins.flow.unspent > 0 ? `<span><i class="unspent"></i>${t('visual.unspent')} ${yen(ins.flow.unspent)}</span>` : ''}
    </div>`;

  return `<div class="card month-visual">
    <h2>${t('visual.h2')}</h2>
    ${cups}
    ${flow}
    <ul class="insights">${ins.notes.slice(0, MAX_NOTES).map(noteHtml).join('')}</ul>
  </div>`;
}

function noteHtml(n: Insight): string {
  const p: Record<string, string | number> = { ...n.params };
  for (const k of MONEY_KEYS) if (k in n.params) p[k] = yen(n.params[k]!);
  if ('profit' in n.params) p.profit = signedYen(n.params.profit!);
  return `<li>${t(`insight.${n.id}` as Key, p)}</li>`;
}
