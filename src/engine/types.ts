// engine で使う型。用語は CLAUDE.md の用語表に合わせる。

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type PlayMode = 'standard' | 'short' | 'extended';

// 原価の変動のしかた（旧版と同じ4種類）
export type CostMode = 'fixed' | 'random' | 'trend' | 'shock';
export type ScenarioId = 'none' | 'summer' | 'inflation' | 'chaos';

// その月の単価
export interface UnitPrices {
  lemon: number; // レモン1個
  sugar: number; // 砂糖1袋
  barista: number; // バリスタ1人の月給
}

// 1杯に使う材料
export interface Recipe {
  lemon: number;
  sugar: number;
}

// 入力時間（秒）。50分版の初期値は docs/game-design.md 参照
export interface TimerSettings {
  firstMonth: number; // 1か月目（練習を兼ねる）
  quarterStart: number; // 4・7・10か月目（バリスタの欄が増える）
  normal: number; // そのほかの月
  closeWhenAllSubmitted: boolean; // 全チームが提出したら早めに締め切る
}

export interface MarketSettings {
  base: number; // 市場予算の基準額（チーム数 × 1チームあたりの額）
  basePerTeam?: number; // 1チームあたりの額。あればチーム数が変わったときにこれで計算し直す
  range: number; // 市場予算の変動幅（%）
  costMode: CostMode;
  costRange: number; // 原価の変動幅（%）
  seed: string;
}

export interface GameConfig {
  difficulty: Difficulty;
  mode: PlayMode;
  months: number; // 1期の月数
  startCalendarMonth: number; // 期の開始月（4 = 4月始まり）
  initialPrices: UnitPrices; // 原価変動の基準。変動は常にここから計算する
  baristaCapacity: number; // バリスタ1人の月間製造上限（杯）
  initialBaristaCount: number; // 期のはじめに雇っているバリスタの人数
  recipe: Recipe;
  startFund: number;
  market: MarketSettings;
  scenario: ScenarioId;
}

export interface Stock {
  lemon: number;
  sugar: number;
}

export interface TeamState {
  teamId: string;
  name: string;
  balance: number; // 資金残高
  totalProfit: number;
  stock: Stock; // 繰越在庫
  baristaCount: number; // 雇っているバリスタの人数（四半期ごとに決める）
}

// 月の決定
export interface MonthlyDecision {
  lemonQty: number; // 仕入れるレモンの数
  sugarQty: number; // 仕入れる砂糖の数
  price: number; // 1杯の販売価格
  maxSell?: number; // 販売上限（任意）。省略すると作れるだけ売る
  watching?: boolean; // 静観（仕入れ・販売をしない。給与はかかる）
}

// 四半期の決定（1・4・7・10か月目）
export interface QuarterlyDecision {
  baristaCount: number;
}

// チームの提出
export interface Submission {
  teamId: string;
  monthlyDecision: MonthlyDecision;
  quarterlyDecision?: QuarterlyDecision; // 四半期の最初の月だけ
  order: number; // 提出順（小さいほど先）。同じ価格の端数の配分に使う
}

// その月の市場の条件
export interface MonthConditions {
  month: number; // 1〜12
  marketBudget: number; // 市場予算（客がその月に使うお金の合計）
  prices: UnitPrices;
  message?: string; // シナリオのお知らせ
}

// 販売チーム1つの、ある月の結果
export interface TeamMonthResult {
  teamId: string;
  price: number;
  offered: number; // 市場に出した杯数
  sold: number; // 売れた杯数
  unsold: number; // 売れ残り（廃棄）
  revenue: number; // 売上
  lemonBought: number;
  sugarBought: number;
  baristaCount: number;
  costLemon: number;
  costSugar: number;
  costBarista: number; // 人件費
  totalCost: number;
  profit: number;
  usedLemon: number;
  usedSugar: number;
  stock: Stock; // 月末の在庫
  balance: number; // 月末の資金残高
}

export interface MonthResult {
  month: number;
  marketBudget: number;
  prices: UnitPrices;
  teamResults: TeamMonthResult[];
}

// ---- CPU チーム ----

// 初級の CPU の作戦
export type CpuType = 'discount' | 'premium' | 'follower' | 'cautious';

// CPU が判断に使ってよい情報。人のチーム画面に出ている情報だけを入れる。
// 今月の市場予算・シード・ほかのチームの今月の決定は入れない（入れようとすると型エラーになる）。
export interface CpuView {
  month: number;
  quarterStart: boolean; // バリスタの人数を決める月か
  prices: UnitPrices; // 今月の単価
  rules: {
    baristaCapacity: number;
    recipe: Recipe;
    teamCount: number;
  };
  me: TeamState; // 自分の資金・在庫・バリスタ人数
  history: MonthResult[]; // 締め切った月の結果（全チームの値段・売れた数・もうけ、その月の市場予算）
}

export interface CpuDecision {
  monthlyDecision: MonthlyDecision;
  quarterlyDecision?: QuarterlyDecision;
}
