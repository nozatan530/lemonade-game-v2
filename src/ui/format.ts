// 表示用の整形（計算はしない）

import { lang, t } from '../i18n';

const MONTHS_EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function yen(n: number): string {
  return `${n < 0 ? '−' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`;
}

export function signedYen(n: number): string {
  return n > 0 ? `+${yen(n)}` : yen(n);
}

// 期の何か月目かを、暦の月に直す（4月始まりなら 1か月目 = 4月）
export function calendarMonth(month: number, startCalendarMonth: number): number {
  return ((startCalendarMonth - 1 + month - 1) % 12) + 1;
}

// 「4月（1か月目）」／「April (Month 1)」
export function monthLabel(month: number, startCalendarMonth: number): string {
  const cal = calendarMonth(month, startCalendarMonth);
  return t('month.label', { cal: lang() === 'en' ? MONTHS_EN_LONG[cal - 1]! : cal, n: month });
}

// 「4月」／「Apr」（グラフや表で使う短い形）
export function monthShort(month: number, startCalendarMonth: number): string {
  const cal = calendarMonth(month, startCalendarMonth);
  return t('month.short', { cal: lang() === 'en' ? MONTHS_EN_SHORT[cal - 1]! : cal });
}

// HTML に埋め込む文字列（チーム名など）をエスケープする
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function secondsLeft(deadlineAt: number, serverNow: number): number {
  return Math.max(0, Math.ceil((deadlineAt - serverNow) / 1000));
}

export function mmss(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// グラフの横軸：目盛りの文字を間引く。最後は必ず出し、最後に近すぎる目盛りは出さない（文字が重ならないように）
export function showTick(i: number, count: number, every: number): boolean {
  const last = count - 1;
  if (i === last || every <= 1) return true;
  return i % every === 0 && last - i >= Math.max(2, Math.ceil(every / 2));
}
