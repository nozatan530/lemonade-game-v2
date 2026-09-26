import { describe, expect, it } from 'vitest';
import { defaultConfig, withMarketPattern } from '../config';
import type { MarketPattern, MonthConditions } from '../types';
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

describe('市場のパターン', () => {
  const run = (pattern: MarketPattern, seed = 'pat', start = 4) => {
    const c = withMarketPattern(defaultConfig(4, seed), pattern);
    c.startCalendarMonth = start;
    const months: MonthConditions[] = [];
    let prev = c.initialPrices;
    for (let m = 1; m <= 12; m++) {
      const cond = monthConditions(m, c, 4, prev);
      months.push(cond);
      prev = cond.prices;
    }
    return months;
  };

  it('変動なし：お客さんの数も材料の値段も、12か月ずっと同じ', () => {
    const ms = run('stable');
    expect(new Set(ms.map((m) => m.marketBudget)).size).toBe(1);
    expect(ms[0]!.marketBudget).toBe(80000);
    for (const m of ms) expect(m.prices).toEqual({ lemon: 80, sugar: 10, barista: 2000 });
  });

  it('多少の変動：お客さんの数は±15%、レモン・砂糖は±10%の中で動く。給料は変わらない', () => {
    for (let i = 0; i < 30; i++) {
      for (const m of run('mild', `m${i}`)) {
        expect(m.marketBudget).toBeGreaterThanOrEqual(68000);
        expect(m.marketBudget).toBeLessThanOrEqual(92000);
        expect(m.prices.lemon).toBeGreaterThanOrEqual(72);
        expect(m.prices.lemon).toBeLessThanOrEqual(88);
        expect(m.prices.sugar).toBeGreaterThanOrEqual(9);
        expect(m.prices.sugar).toBeLessThanOrEqual(11);
        expect(m.prices.barista).toBe(2000);
      }
    }
    expect(new Set(run('mild').map((m) => m.marketBudget)).size).toBeGreaterThan(3);
  });

  it('現実ベース：お客さんは7・8月が多く1月が少ない。1年の平均は市場の大きさとほぼ同じ', () => {
    const ms = run('realistic', 'real', 1); // 1月始まりで暦の月どおりに並べる
    const b = ms.map((m) => m.marketBudget);
    expect(Math.max(...b)).toBeOneOf([b[6], b[7]]);
    expect(Math.min(...b)).toBe(b[0]);
    const avg = b.reduce((x, y) => x + y, 0) / 12;
    expect(avg).toBeGreaterThan(80000 * 0.95);
    expect(avg).toBeLessThan(80000 * 1.05);
    // レモンは季節の値段
    expect(ms.map((m) => m.prices.lemon)).toEqual([44, 53, 66, 84, 102, 119, 133, 119, 75, 62, 53, 49]);
  });

  it('現実ベース：毎月のお知らせがあり、7月は1年でいちばん売れる時期と伝える', () => {
    const ms = run('realistic', 'news', 4); // 4月始まり：4か月目が7月
    for (const m of ms) expect(m.message).toBeTruthy();
    expect(ms[3]!.message).toContain('いちばん売れる');
  });

  it('市場が読めない：ときどき急に増えたり減ったりする（半分や1.6倍）', () => {
    const all = Array.from({ length: 40 }, (_, i) => run('volatile', `v${i}`)).flat();
    expect(all.some((m) => m.marketBudget < 80000 * 0.45)).toBe(true);
    expect(all.some((m) => m.marketBudget > 80000 * 1.5)).toBe(true);
    expect(all.some((m) => m.prices.lemon > 80 * 1.5)).toBe(true);
    expect(all.some((m) => m.prices.lemon < 80 * 0.6)).toBe(true);
    for (const m of all) expect(m.prices.barista).toBe(2000);
  });

  it('お知らせは現実ベースのときだけ', () => {
    for (const p of ['stable', 'mild', 'volatile'] as const) {
      for (const m of run(p)) expect(m.message).toBeUndefined();
    }
  });

  it('同じシードなら同じ動き', () => {
    for (const p of ['stable', 'mild', 'realistic', 'volatile'] as const) expect(run(p, 'same')).toEqual(run(p, 'same'));
  });
});
