// 表示用の整形（計算はしない）

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

export function monthLabel(month: number, startCalendarMonth: number): string {
  return `${calendarMonth(month, startCalendarMonth)}月（${month}か月目）`;
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
