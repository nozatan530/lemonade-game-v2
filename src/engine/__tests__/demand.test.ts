import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { autoMonthValues, monthConditions } from '../demand';

describe('autoMonthValues（シナリオなしの市場予算と原価）', () => {
  it('市場予算は毎月変わり、基準額 ±変動幅 の範囲に収まる', () => {
    for (const seed of ['g1790312960315', 'lemon2025', 'x']) {
      const config = defaultConfig(4, seed);
      const budgets = Array.from({ length: 12 }, (_, i) => autoMonthValues(i + 1, config).marketBudget);
      expect(new Set(budgets).size).toBeGreaterThanOrEqual(6);
      for (const b of budgets) {
        expect(b).toBeGreaterThanOrEqual(80000 * 0.7);
        expect(b).toBeLessThanOrEqual(80000 * 1.3);
      }
    }
  });

  it('原価が「ランダム」なら、単価も毎月変わる', () => {
    const config = defaultConfig(4, 'lemon2025');
    config.market.costMode = 'random';
    const lemons = Array.from({ length: 12 }, (_, i) => autoMonthValues(i + 1, config).prices.lemon);
    expect(new Set(lemons).size).toBeGreaterThanOrEqual(6);
  });

  it('同じシードなら、何度計算しても同じ', () => {
    const config = defaultConfig(4, 'same');
    expect(autoMonthValues(5, config)).toEqual(autoMonthValues(5, config));
  });
});

describe('季節で変わる材料の値段（seasonal）', () => {
  // 1月始まりの設定で、暦の1月〜12月のレモンの値段を見る
  const janStart = (seed = 'season') => {
    const c = defaultConfig(4, seed);
    c.market.costMode = 'seasonal';
    c.startCalendarMonth = 1;
    return c;
  };
  const lemons = (seed?: string) => Array.from({ length: 12 }, (_, i) => autoMonthValues(i + 1, janStart(seed)).prices.lemon);

  it('レモン：1年の平均は約80円', () => {
    const avg = lemons().reduce((a, b) => a + b, 0) / 12;
    expect(avg).toBeGreaterThanOrEqual(79);
    expect(avg).toBeLessThanOrEqual(81);
  });

  it('レモン：7月がいちばん高く、1月がいちばん安い（7月の約1/3）', () => {
    const l = lemons();
    expect(Math.max(...l)).toBe(l[6]);
    expect(Math.min(...l)).toBe(l[0]);
    expect(l[0]! / l[6]!).toBeCloseTo(1 / 3, 1);
  });

  it('レモン：1月から7月まで上がり、8月から下がりはじめ、9月に急に下がり、12月まで下がる', () => {
    const l = lemons();
    for (let m = 1; m < 7; m++) expect(l[m]!).toBeGreaterThan(l[m - 1]!);
    for (let m = 7; m < 12; m++) expect(l[m]!).toBeLessThan(l[m - 1]!);
    const drops = [7, 8, 9, 10, 11].map((m) => l[m - 1]! - l[m]!);
    expect(Math.max(...drops)).toBe(l[7]! - l[8]!); // 8月→9月の下がり方がいちばん大きい
  });

  it('レモン：ゲームがちがっても同じ形（シードに左右されない）', () => {
    expect(lemons('a')).toEqual(lemons('b'));
  });

  it('砂糖：9〜11円で、1年間変わらない。ゲームによってちがう', () => {
    const sugarOf = (seed: string) => Array.from({ length: 12 }, (_, i) => autoMonthValues(i + 1, janStart(seed)).prices.sugar);
    for (let i = 0; i < 100; i++) {
      const s = sugarOf(`g${i}`);
      expect(new Set(s).size).toBe(1);
      expect(s[0]).toBeGreaterThanOrEqual(9);
      expect(s[0]).toBeLessThanOrEqual(11);
    }
    expect(new Set(Array.from({ length: 50 }, (_, i) => sugarOf(`g${i}`)[0])).size).toBeGreaterThan(1);
  });

  it('給料は変わらない', () => {
    for (let m = 1; m <= 12; m++) expect(autoMonthValues(m, janStart()).prices.barista).toBe(2000);
  });

  it('4月始まりなら、1か月目から4月の値段になる（初期単価の80円ではない）', () => {
    const c = defaultConfig(4, 'april');
    c.market.costMode = 'seasonal';
    const first = monthConditions(1, c, 4, c.initialPrices);
    expect(first.prices.lemon).toBe(84);
    const july = monthConditions(4, c, 4, first.prices);
    expect(july.prices.lemon).toBe(133);
  });
});
