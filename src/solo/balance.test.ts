// ソロモードのバランスの目標（シードを固定しているので、毎回同じ結果になる）。
// CPU や市場の数値を変えたら、ここが通るかどうかで確かめる。

import { describe, expect, it } from 'vitest';
import { clicker, playSolo, undercutter, winRate } from './balance';

const N = 120;
const avgRank = (ranks: number[]) => ranks.reduce((a, c, i) => a + c * (i + 1), 0) / ranks.reduce((a, b) => a + b, 0);

describe('ソロモードのバランス（シナリオなし）', () => {
  it('ふつう：何も考えずに押し続けると、1位は1割以下で、平均3位より下', () => {
    const r = winRate(clicker, 'normal', N);
    expect(r.firstRate).toBeLessThanOrEqual(0.1);
    expect(avgRank(r.ranks)).toBeGreaterThanOrEqual(3);
  });

  it('ふつう：ライバルより安くしてたくさん売る遊び方なら、半分以上1位になれる', () => {
    expect(winRate(undercutter, 'normal', N).firstRate).toBeGreaterThanOrEqual(0.5);
  });

  it('むずかしい：押し続けるだけではほぼ勝てず、考えれば勝ち目がある', () => {
    expect(winRate(clicker, 'hard', N).firstRate).toBeLessThanOrEqual(0.05);
    expect(winRate(undercutter, 'hard', N).firstRate).toBeGreaterThanOrEqual(0.4);
  });

  it('やさしい：考えて遊べば、ほとんど1位になれる', () => {
    expect(winRate(undercutter, 'easy', N).firstRate).toBeGreaterThanOrEqual(0.8);
  });

  it('難易度が上がるほど、同じ遊び方でも1位になりにくい', () => {
    const e = winRate(undercutter, 'easy', N).firstRate;
    const h = winRate(undercutter, 'hard', N).firstRate;
    expect(h).toBeLessThan(e);
  });

  it('シナリオがあっても最後まで動く', () => {
    for (const scenario of ['summer', 'inflation', 'chaos'] as const) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const { state } = playSolo(undercutter, { seed: 'scn', difficulty, scenario });
        expect(state.phase).toBe('final');
        for (const t of state.teams) expect(Number.isFinite(t.balance)).toBe(true);
      }
    }
  });
});
