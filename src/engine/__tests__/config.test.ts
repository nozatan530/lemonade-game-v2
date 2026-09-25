import { describe, expect, it } from 'vitest';
import { defaultConfig, isQuarterStart } from '../config';

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
