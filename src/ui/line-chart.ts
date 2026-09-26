// 折れ線グラフ（資金の推移・値段の推移など）。SVG の文字列を返す。
// 色はチームの並び順で固定（--series-1〜8）。9チーム以上は色が足りないので描かない（表で見る）。
// 線の端にチーム名を直接書き、凡例も付ける（色だけに頼らない）。
// 値が null の月は線を切る（静観して値段がない月など）。

import { esc, showTick } from './format';

export const MAX_SERIES = 8;

export interface Series {
  name: string;
  slot: number; // 0 始まり。チームの並び順（色はこれで決まり、順位では変わらない）
  values: (number | null)[]; // x の順に並んだ値
  emphasis?: boolean; // 自分のお店など、太く描く
}

export function lineChartSvg(opts: {
  series: Series[];
  xLabels: string[];
  formatY: (v: number) => string;
  width?: number;
  height?: number;
  ariaLabel?: string;
  includeZero?: boolean; // 縦軸に0を含める（既定：含める）
}): string {
  const { series, xLabels, formatY } = opts;
  if (series.length === 0 || series.length > MAX_SERIES || xLabels.length < 2) return '';
  const W = opts.width ?? 720;
  const H = opts.height ?? 360;
  const labelWidth = Math.min(110, Math.max(64, ...series.map((s) => s.name.length * 13 + 14)));
  const pad = { top: 16, right: labelWidth, bottom: 28, left: 56 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length === 0) return '';
  let min = opts.includeZero === false ? Math.min(...all) : Math.min(0, ...all);
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
      `<text x="${pad.left - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${esc(formatY(v))}</text>`);
  }
  const every = Math.ceil(xLabels.length / Math.max(2, Math.floor(iw / 44)));
  const xTicks = xLabels.map((l, i) => showTick(i, xLabels.length, every)
    ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="tick">${esc(l)}</text>` : '').join('');

  // 線の端のラベル：最後に値がある点の横。重ならないように、上から順に最小間隔をあけて並べる
  const ends = series
    .map((s) => {
      let last = s.values.length - 1;
      while (last >= 0 && s.values[last] === null) last--;
      return { s, last, ty: last >= 0 ? y(s.values[last]!) : 0 };
    })
    .filter((e) => e.last >= 0)
    .sort((a, b) => a.ty - b.ty);
  for (let i = 1; i < ends.length; i++) {
    if (ends[i]!.ty - ends[i - 1]!.ty < 15) ends[i]!.ty = ends[i - 1]!.ty + 15;
  }

  // 強調する線（自分のお店）は最後に描いて、いちばん上に重ねる
  const drawOrder = [...series.filter((x) => !x.emphasis), ...series.filter((x) => x.emphasis)];
  const lines = drawOrder.map((s) => {
    const color = `var(--series-${s.slot + 1})`;
    const width = s.emphasis ? 3.5 : 2;
    // null で区切って、つながっている部分ごとに線を引く
    const segments: string[] = [];
    let current: string[] = [];
    s.values.forEach((v, i) => {
      if (v === null) {
        if (current.length) segments.push(current.join(' '));
        current = [];
      } else current.push(`${x(i)},${y(v)}`);
    });
    if (current.length) segments.push(current.join(' '));
    const paths = segments.map((pts) =>
      `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
    // 点は小さく（縁取りで線が切れて見えないように）。マウスを重ねる当たり判定は透明な大きい円で取る
    const dots = s.values.map((v, i) => v === null ? '' : `<g><circle cx="${x(i)}" cy="${y(v)}" r="${s.emphasis ? 3.5 : 2.5}" fill="${color}"/>
      <circle cx="${x(i)}" cy="${y(v)}" r="9" fill="transparent" class="hit"><title>${esc(s.name)}・${esc(xLabels[i] ?? '')}：${esc(formatY(v))}</title></circle></g>`).join('');
    return paths + dots;
  }).join('');
  const labels = ends.map(({ s, last, ty }) =>
    `<text x="${x(last) + 8}" y="${ty + 4}" class="end-label${s.emphasis ? ' strong' : ''}">${esc(s.name)}</text>`).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="line-chart" role="img" aria-label="${esc(opts.ariaLabel ?? 'グラフ')}">
    ${grid.join('')}${xTicks}${lines}${labels}</svg>`;
}

export function legendHtml(series: Series[]): string {
  return `<div class="legend">${series.map((s) =>
    `<span><i style="background:var(--series-${s.slot + 1})"></i>${s.emphasis ? `<strong>${esc(s.name)}</strong>` : esc(s.name)}</span>`).join('')}</div>`;
}

export function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
