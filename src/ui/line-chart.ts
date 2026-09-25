// 折れ線グラフ（資金の推移など）。SVG の文字列を返す。
// 色はチームの並び順で固定（--series-1〜8）。9チーム以上は色が足りないので描かない（表で見る）。
// 線の端にチーム名を直接書き、凡例も付ける（色だけに頼らない）。

import { esc } from './format';

export const MAX_SERIES = 8;

export interface Series {
  name: string;
  slot: number; // 0 始まり。チームの並び順（色はこれで決まり、順位では変わらない）
  values: number[]; // x の順に並んだ値
}

export function lineChartSvg(opts: {
  series: Series[];
  xLabels: string[];
  formatY: (v: number) => string;
  width?: number;
  height?: number;
}): string {
  const { series, xLabels, formatY } = opts;
  if (series.length === 0 || series.length > MAX_SERIES || xLabels.length < 2) return '';
  const W = opts.width ?? 720;
  const H = opts.height ?? 360;
  const pad = { top: 16, right: 110, bottom: 32, left: 72 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.values);
  let min = Math.min(0, ...all);
  let max = Math.max(...all);
  if (max === min) max = min + 1;
  const step = niceStep((max - min) / 4);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;

  const x = (i: number) => pad.left + (iw * i) / (xLabels.length - 1);
  const y = (v: number) => pad.top + ih - ((v - min) / (max - min)) * ih;

  const grid: string[] = [];
  for (let v = min; v <= max + step / 2; v += step) {
    grid.push(`<line x1="${pad.left}" x2="${pad.left + iw}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'axis-zero' : 'grid'}"/>`,
      `<text x="${pad.left - 8}" y="${y(v) + 4}" text-anchor="end" class="tick">${esc(formatY(v))}</text>`);
  }
  const every = Math.ceil(xLabels.length / 7);
  const xTicks = xLabels.map((l, i) => (i % every === 0 || i === xLabels.length - 1)
    ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="tick">${esc(l)}</text>` : '').join('');

  // 線の端のラベルが重ならないように、上から順に最小間隔をあけて並べる
  const ends = series
    .map((s) => {
      const last = s.values.length - 1;
      return { s, last, ty: y(s.values[last]!) };
    })
    .sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i]!.ty - ends[i - 1]!.ty < 16) ends[i]!.ty = ends[i - 1]!.ty + 16;
  }

  const lines = series.map((s) => {
    const color = `var(--series-${s.slot + 1})`;
    const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const dots = s.values.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}" class="dot">
      <title>${esc(s.name)}・${esc(xLabels[i] ?? '')}：${esc(formatY(v))}</title></circle>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const labels = ends.map(({ s, last, ty }) =>
    `<text x="${x(last) + 10}" y="${ty + 4}" class="end-label">${esc(s.name)}</text>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" class="line-chart" role="img" aria-label="資金の推移">
    ${grid.join('')}${xTicks}${lines}${labels}</svg>`;
}

export function legendHtml(series: Series[]): string {
  return `<div class="legend">${series.map((s) =>
    `<span><i style="background:var(--series-${s.slot + 1})"></i>${esc(s.name)}</span>`).join('')}</div>`;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
