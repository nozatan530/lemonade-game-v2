// 難易度・実施モード・初期値。数値は docs/game-design.md の初期値（要調整）。

import { seededRand } from './random';
import type { Difficulty, GameConfig, MarketPattern, PlayMode, TimerSettings } from './types';

export const PLAY_MODES: Record<PlayMode, { months: number; minutes: number }> = {
  standard: { months: 12, minutes: 50 },
  short: { months: 6, minutes: 30 },
  extended: { months: 12, minutes: 100 },
};

// 難易度ごとに使う要素
export interface DifficultyFeatures {
  fixedCost: boolean; // 出店料
  recipe: boolean; // レシピ選択
  advertising: boolean; // 広告
  qualitySegment: boolean; // 品質重視層
  trendSegment: boolean; // 話題性重視層
  location: boolean; // 立地
  events: boolean; // イベント
  weather: boolean; // 天候
  reputation: boolean; // 評判
}

export const DIFFICULTY_FEATURES: Record<Difficulty, DifficultyFeatures> = {
  beginner: {
    fixedCost: false, recipe: false, advertising: false,
    qualitySegment: false, trendSegment: false,
    location: false, events: false, weather: false, reputation: false,
  },
  intermediate: {
    fixedCost: true, recipe: true, advertising: true,
    qualitySegment: true, trendSegment: true,
    location: false, events: false, weather: false, reputation: false,
  },
  advanced: {
    fixedCost: true, recipe: true, advertising: true,
    qualitySegment: true, trendSegment: true,
    location: true, events: true, weather: true, reputation: true,
  },
};

// 市場予算の基準額（1チームあたり）
export const MARKET_BASE_PER_TEAM = 20000;

// 四半期の決定をする月（1・4・7・10か月目）
export function isQuarterStart(month: number): boolean {
  return (month - 1) % 3 === 0;
}

// 初期設定（旧版の既定値と同じ）
export function defaultConfig(teamCount: number, seed: string): GameConfig {
  return {
    difficulty: 'beginner',
    mode: 'standard',
    months: PLAY_MODES.standard.months,
    startCalendarMonth: 4,
    initialPrices: { lemon: 80, sugar: 10, barista: 2000 },
    baristaCapacity: 50,
    initialBaristaCount: 1,
    recipe: { lemon: 1, sugar: 1 },
    startFund: 10000,
    market: {
      base: teamCount * MARKET_BASE_PER_TEAM,
      range: 30,
      costMode: 'fixed',
      costRange: 20,
      seed,
    },
    scenario: 'none',
  };
}

// 入力時間の初期値（50分版）
export const DEFAULT_TIMER: TimerSettings = {
  firstMonth: 150,
  quarterStart: 105,
  normal: 90,
  closeWhenAllSubmitted: true,
};

// その月の入力時間（秒）
export function inputSecondsFor(month: number, timer: TimerSettings): number {
  if (month === 1) return timer.firstMonth;
  if (isQuarterStart(month)) return timer.quarterStart;
  return timer.normal;
}

// チーム数が変わったときの設定（開始時に未参加のチームを外したとき）。
// 1チームあたりの額（basePerTeam）があれば、それ × 新しいチーム数にする。
// ないときは、基準が標準（チーム数 × 20,000円）のままなら新しいチーム数に合わせ、GM が変えていたらその値を残す。
export function withTeamCount(config: GameConfig, fromCount: number, toCount: number): GameConfig {
  const perTeam = config.market.basePerTeam;
  if (perTeam !== undefined) return { ...config, market: { ...config.market, base: perTeam * toCount } };
  if (config.market.base !== fromCount * MARKET_BASE_PER_TEAM) return config;
  return { ...config, market: { ...config.market, base: toCount * MARKET_BASE_PER_TEAM } };
}

// ゲームごとに1チームあたりの市場予算を決める（min〜max の間、1,000円単位）。
// シードで決まるので、同じシードなら同じ大きさになる。チームには見せない（結果で市場予算がわかるだけ）。
export interface MarketSizeRange {
  min: number;
  max: number;
}

// 対戦モードの「おまかせ」の幅。値はソロの「ふつう」とそろえる（docs/game-design.md）
export const DEFAULT_MARKET_SIZE: MarketSizeRange = { min: 12000, max: 17000 };

export function pickMarketPerTeam(seed: string, range: MarketSizeRange): number {
  const steps = Math.floor((range.max - range.min) / 1000);
  // 月ごとの乱数（月×100＋k）と重ならない番号を使う
  return range.min + Math.min(steps, Math.floor(seededRand(seed, 999_001) * (steps + 1))) * 1000;
}

// 市場の大きさをゲームごとにランダムにした設定
export function withRandomMarketSize(config: GameConfig, teamCount: number, range: MarketSizeRange): GameConfig {
  const perTeam = pickMarketPerTeam(config.market.seed, range);
  return { ...config, market: { ...config.market, base: perTeam * teamCount, basePerTeam: perTeam } };
}

// 期の何か月目かを暦の月に直す（4月始まりなら 1か月目 = 4月）
export function calendarMonthOf(month: number, startCalendarMonth: number): number {
  return ((startCalendarMonth - 1 + month - 1) % 12) + 1;
}

// 市場のパターン：お客さんの数（市場予算）と材料の値段の変わり方の組み合わせ。値は docs/game-design.md
export const MARKET_PATTERNS: Record<MarketPattern, {
  label: string;
  description: string;
  market: Pick<GameConfig['market'], 'range' | 'demandMode' | 'costMode' | 'costRange'>;
}> = {
  stable: {
    label: '変動なし',
    description: 'お客さんの数も材料の値段も、1年間ずっと同じ。',
    market: { range: 0, demandMode: 'random', costMode: 'fixed', costRange: 0 },
  },
  mild: {
    label: '多少の変動',
    description: 'お客さんの数は毎月±15%、レモンと砂糖の値段は毎月±10%くらい変わる。',
    market: { range: 15, demandMode: 'random', costMode: 'mild', costRange: 10 },
  },
  realistic: {
    label: '現実ベースの変動',
    description: 'お客さんは夏（7・8月）に多く冬に少ない。レモンは7月が高く1月が安い。毎月のお知らせが手がかり。',
    market: { range: 5, demandMode: 'seasonal', costMode: 'seasonal', costRange: 0 },
  },
  volatile: {
    label: '市場が読めない',
    description: 'お客さんの数も材料の値段も大きく動き、ときどき急に増えたり減ったりする。',
    market: { range: 40, demandMode: 'volatile', costMode: 'volatile', costRange: 30 },
  },
};

// 市場のパターンを設定に当てはめる（シナリオは使わない）
export function withMarketPattern(config: GameConfig, pattern: MarketPattern): GameConfig {
  return { ...config, scenario: 'none', market: { ...config.market, ...MARKET_PATTERNS[pattern].market, pattern } };
}
