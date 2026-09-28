// ソロモードのバランスの目標（シードを固定しているので、毎回同じ結果になる）。
// CPU や市場の数値を変えたら、ここが通るかどうかで確かめる。4つの市場のパターンすべてで確かめる。

import { describe, expect, it } from 'vitest';
import type { MarketPattern } from '../engine/types';
import { clicker, playSolo, undercutter, winRate } from './balance';

const N = 120;
const PATTERNS: MarketPattern[] = ['stable', 'mild', 'realistic', 'volatile'];
const avgRank = (ranks: number[]) => ranks.reduce((a, c, i) => a + c * (i + 1), 0) / ranks.reduce((a, b) => a + b, 0);

describe.each(PATTERNS)('ソロモードのバランス（市場のパターン：%s）', (pattern) => {
  it('ふつう：何も考えずに押し続けると、1位は1割以下で、平均の順位は2.5位より下', () => {
    const r = winRate(clicker, 'normal', N, pattern);
    expect(r.firstRate).toBeLessThanOrEqual(0.1);
    expect(avgRank(r.ranks)).toBeGreaterThanOrEqual(2.5);
  });

  it('ふつう：ライバルより安くしてたくさん売る遊び方なら、半分以上1位になれる', () => {
    expect(winRate(undercutter, 'normal', N, pattern).firstRate).toBeGreaterThanOrEqual(0.5);
  });

  it('むずかしい：押し続けるだけではほぼ勝てず、考えれば勝ち目がある', () => {
    expect(winRate(clicker, 'hard', N, pattern).firstRate).toBeLessThanOrEqual(0.05);
    expect(winRate(undercutter, 'hard', N, pattern).firstRate).toBeGreaterThanOrEqual(0.4);
  });

  it('やさしい：考えて遊べば、ほとんど1位になれる', () => {
    expect(winRate(undercutter, 'easy', N, pattern).firstRate).toBeGreaterThanOrEqual(0.7);
  });

  it('押し続けるだけの遊び方は、やさしいより、むずかしいほうが勝ちにくい', () => {
    expect(winRate(clicker, 'hard', N, pattern).firstRate).toBeLessThanOrEqual(winRate(clicker, 'easy', N, pattern).firstRate);
  });

  it('どのむずかしさでも最後まで動き、数値がおかしくならない', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const { state } = playSolo(undercutter, { seed: 'run', difficulty, pattern });
      expect(state.phase).toBe('final');
      for (const t of state.teams) expect(Number.isFinite(t.balance)).toBe(true);
    }
  });
});

describe.each([3, 8])('ソロモードのバランス（お店の数：%i）', (teamCount) => {
  it('ふつう・むずかしい：押し続けるだけでは、1位は1割5分以下', () => {
    for (const d of ['normal', 'hard'] as const) {
      expect(winRate(clicker, d, N, 'volatile', teamCount).firstRate).toBeLessThanOrEqual(0.15);
    }
  });

  it('考えて遊ぶほうが、押し続けるより平均の順位が上', () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      expect(avgRank(winRate(undercutter, d, N, 'stable', teamCount).ranks))
        .toBeLessThan(avgRank(winRate(clicker, d, N, 'stable', teamCount).ranks));
    }
  });
});
