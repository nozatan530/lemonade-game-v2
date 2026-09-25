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
