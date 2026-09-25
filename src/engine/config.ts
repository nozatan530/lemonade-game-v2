// 難易度・実施モード・初期値。数値は docs/game-design.md の初期値（要調整）。

import type { Difficulty, GameConfig, PlayMode, TimerSettings } from './types';

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
