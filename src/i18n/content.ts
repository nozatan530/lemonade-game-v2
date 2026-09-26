// engine が持っている表示用の文（日本語）を、いまの言語で出す。engine の ID から辞書のキーを引く。

import { SEASON_NEWS } from '../engine/scenarios/seasonal';
import type { CpuType, MarketPattern } from '../engine/types';
import { t, type Key } from './index';

export const patternLabel = (p: MarketPattern) => t(`pattern.${p}.label` as Key);
export const patternDesc = (p: MarketPattern) => t(`pattern.${p}.desc` as Key);
export const difficultyLabel = (d: 'easy' | 'normal' | 'hard') => t(`difficulty.${d}.label` as Key);
export const difficultyDesc = (d: 'easy' | 'normal' | 'hard') => t(`difficulty.${d}.desc` as Key);
export const cpuLabel = (c: CpuType) => t(`cpu.${c}.label` as Key);
export const cpuDesc = (c: CpuType) => t(`cpu.${c}.desc` as Key);

// 毎月のお知らせ。季節のお知らせなら辞書の文に置き換える（それ以外はそのまま）
export function newsText(message: string): string {
  const i = SEASON_NEWS.indexOf(message);
  return i >= 0 ? t(`news.${i + 1}` as Key) : message;
}

// ソロのお店の名前（保存された名前ではなく、表示するときの言語で出す）
export function soloTeamName(teamId: string): string {
  if (teamId === 't1') return t('solo.you');
  const letter = { t2: 'B', t3: 'C', t4: 'D' }[teamId];
  return letter ? t('solo.stand', { x: letter }) : teamId;
}
