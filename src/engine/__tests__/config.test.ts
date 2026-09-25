import { describe, expect, it } from 'vitest';
import { DEFAULT_TIMER, defaultConfig, inputSecondsFor, isQuarterStart, withTeamCount } from '../config';

describe('isQuarterStart', () => {
  it('1・4・7・10か月目が四半期の最初の月', () => {
    const months = Array.from({ length: 12 }, (_, i) => i + 1).filter(isQuarterStart);
    expect(months).toEqual([1, 4, 7, 10]);
  });
});

describe('defaultConfig', () => {
  it('市場予算の基準額はチーム数 × 20,000円', () => {
    expect(defaultConfig(4, 's').market.base).toBe(80000);
  });
});

describe('シナリオのお知らせ文', () => {
  it('暦の月の表記を含まない（月は画面側で開始月から組み立てる）', async () => {
    const { SCENARIOS } = await import('../scenarios');
    for (const sc of Object.values(SCENARIOS)) {
      for (const m of sc.months) expect(m.msg).not.toMatch(/\d+月/);
    }
  });
});

describe('inputSecondsFor（入力時間）', () => {
  it('1か月目は長め、四半期の最初の月は少し長め', () => {
    const secs = Array.from({ length: 12 }, (_, i) => inputSecondsFor(i + 1, DEFAULT_TIMER));
    expect(secs).toEqual([150, 90, 90, 105, 90, 90, 105, 90, 90, 105, 90, 90]);
  });

  it('50分版の入力・結果表示・切り替えの合計が、12か月の枠（36分）に収まる', () => {
    const input = Array.from({ length: 12 }, (_, i) => inputSecondsFor(i + 1, DEFAULT_TIMER)).reduce((a, b) => a + b, 0);
    const resultDisplay = 60 * 12;
    const transition = 15 * 12;
    expect(input + resultDisplay + transition).toBeLessThanOrEqual(36 * 60);
  });
});

describe('withTeamCount（未参加チームを外したとき）', () => {
  it('市場予算の基準が標準なら、新しいチーム数 × 20,000円にする', () => {
    const c = withTeamCount(defaultConfig(4, 's'), 4, 3);
    expect(c.market.base).toBe(60000);
  });

  it('GM が基準を変えていたら、そのまま残す', () => {
    const custom = defaultConfig(4, 's');
    custom.market.base = 100000;
    expect(withTeamCount(custom, 4, 3).market.base).toBe(100000);
  });

  it('元の設定は変えない', () => {
    const c = defaultConfig(4, 's');
    withTeamCount(c, 4, 2);
    expect(c.market.base).toBe(80000);
  });
});
