// Realtime Database に置くデータの形。
// 月のキーは m01〜m12 にする（1, 2, 3… の連番キーは、データベースが配列に変えて返してしまうため）。

import type {
  GameConfig, MonthlyDecision, MonthResult, QuarterlyDecision, TeamState, TimerSettings, UnitPrices,
} from '../engine/types';

export type Phase = 'lobby' | 'input' | 'result' | 'final';

export interface GameMeta {
  gmUid: string;
  createdAt: number;
  status: 'active' | 'ended';
}

// 進行の状態。全員が読める
export interface Clock {
  month: number; // 0 = 開始前
  monthKey: string; // 'm01' など
  phase: Phase;
  deadlineAt: number; // 入力の締切（サーバー時刻・ミリ秒）
  quarterStart: boolean; // 四半期の最初の月（バリスタを決められる）
  prices: UnitPrices; // その月の単価
  message?: string; // シナリオのお知らせ
}

export interface TeamSlot {
  name: string;
  order: number; // 表示順
  uid?: string; // 参加した端末（匿名認証）の uid
}

export interface SubmissionDoc {
  monthlyDecision: MonthlyDecision;
  quarterlyDecision?: QuarterlyDecision;
  submittedAt: number; // サーバー時刻。提出順に使う
}

// チームにも見せる設定。シードを含む config は GM だけが読める（市場予算を先読みされないように）
export interface PublicConfig {
  months: number;
  startCalendarMonth: number;
  baristaCapacity: number;
  initialBaristaCount: number;
  recipe: { lemon: number; sugar: number };
  startFund: number;
}

export function publicConfigOf(c: GameConfig): PublicConfig {
  return {
    months: c.months,
    startCalendarMonth: c.startCalendarMonth,
    baristaCapacity: c.baristaCapacity,
    initialBaristaCount: c.initialBaristaCount,
    recipe: { ...c.recipe },
    startFund: c.startFund,
  };
}

// games/{gameCode} の中身
export interface GameDoc {
  meta: GameMeta;
  config: GameConfig;
  public: PublicConfig;
  settings: { timer: TimerSettings };
  clock: Clock;
  teams: Record<string, TeamSlot>;
  state?: Record<string, TeamState>; // 月末の状態（GM が書く）
  hidden?: Record<string, { marketBudget: number }>; // その月の市場予算（GM だけが読める。結果で公開）
  decided?: Record<string, Record<string, MonthlyDecision>>; // 補完後の実際の決定（GM だけ）
  results?: Record<string, MonthResult>;
  submitted?: Record<string, Record<string, true>>; // 提出済みの印（中身は含まない）
  subs?: Record<string, Record<string, SubmissionDoc>>;
}

export function monthKey(month: number): string {
  return `m${String(month).padStart(2, '0')}`;
}
