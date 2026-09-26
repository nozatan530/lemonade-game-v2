// 棒グラフ（月ごとのもうけなど、プラスとマイナスがある値）。SVG の文字列を返す。
// 0円の線から上がプラス、下がマイナス。プラスとマイナスは色を分け（青と赤の対）、表でも数字を見られるようにする。

import { esc, showTick } from './format';
import { niceStep } from './line-chart';

export function barChartSvg(opts: {
  values: number[];
  labels: string[];
  formatY: (v: number) => string;
  formatValue?: (v: number) => string; // マウスを重ねたときの表示
  width?: number;
  height?: number;
  ariaLabel?: string;
}): string {
  const { values, labels, formatY } = opts;
  if (values.length === 0) return '';
  const W = opts.width ?? 720;
  const H = opts.height ?? 260;
  const pad = { top: 12, right: 12, bottom: 28, left: 56 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (max === min) max = min + 1;
  const step = niceStep((max - min) / 4);
  min = Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const y = (v: number) => pad.top + ih - ((v - min) / (max - min)) * ih;

  const slot = iw / values.length;
  const barW = Math.max(4, Math.min(28, slot - 4)); // 棒と棒の間は2px以上あける
  const grid: string[] = [];
  for (let v = min; v <= max + step / 2; v += step) {
    grid.push(`<line x1="${pad.left}" x2="${pad.left + iw}" y1="${y(v)}" y2="${y(v)}" class="${v === 0 ? 'axis-zero' : 'grid'}"/>`,
      `<text x="${pad.left - 6}" y="${y(v) + 4}" text-anchor="end" class="tick">${esc(formatY(v))}</text>`);
  }
  const every = Math.ceil(values.length / Math.max(2, Math.floor(iw / 30)));
  const bars = values.map((v, i) => {
    const cx = pad.left + slot * i + slot / 2;
    const top = y(Math.max(0, v));
    const h = Math.max(1, Math.abs(y(v) - y(0)));
    const r = Math.min(4, barW / 2, h / 2);
    const cls = v >= 0 ? 'bar-pos' : 'bar-neg';
    // 値の側の角だけ丸める（0円の線の側は四角のまま）
    const path = v >= 0
      ? roundedTop(cx - barW / 2, top, barW, h, r)
      : roundedBottom(cx - barW / 2, y(0), barW, h, r);
    const label = showTick(i, values.length, every)
      ? `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="tick">${esc(labels[i] ?? '')}</text>` : '';
    return `<g><path d="${path}" class="${cls}"><title>${esc(labels[i] ?? '')}：${esc((opts.formatValue ?? formatY)(v))}</title></path>${label}</g>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="bar-chart" role="img" aria-label="${esc(opts.ariaLabel ?? 'グラフ')}">
    ${grid.join('')}${bars}</svg>`;
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function roundedBottom(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x},${y} H${x + w} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} Z`;
}
