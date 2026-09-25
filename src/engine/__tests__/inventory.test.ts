import { describe, expect, it } from 'vitest';
import { nextStock, offeredCups, productionCapacity, sanitizeDecision } from '../inventory';

const cfg = { baristaCapacity: 50, recipe: { lemon: 1, sugar: 2 } };

describe('productionCapacity（作れる杯数）', () => {
  it('在庫と今月の仕入れを合わせて、材料とバリスタの少ない方が上限', () => {
    const c = productionCapacity({ lemon: 10, sugar: 0 }, 30, 100, 1, cfg);
    expect(c.capLemon).toBe(40);
    expect(c.capSugar).toBe(50);
    expect(c.capBarista).toBe(50);
    expect(c.maxMake).toBe(40);
  });

  it('バリスタが0人なら作れない', () => {
    expect(productionCapacity({ lemon: 0, sugar: 0 }, 100, 100, 0, cfg).maxMake).toBe(0);
  });
});

describe('offeredCups（市場に出す杯数）', () => {
  const cap = productionCapacity({ lemon: 0, sugar: 0 }, 40, 80, 1, cfg); // 40杯

  it('販売上限を省略したら作れるだけ出す', () => {
    expect(offeredCups({ lemonQty: 40, sugarQty: 80, price: 100 }, cap)).toBe(40);
  });

  it('販売上限があればそこまで', () => {
    expect(offeredCups({ lemonQty: 40, sugarQty: 80, price: 100, maxSell: 25 }, cap)).toBe(25);
  });

  it('販売上限が作れる数より多くても、作れる数まで', () => {
    expect(offeredCups({ lemonQty: 40, sugarQty: 80, price: 100, maxSell: 999 }, cap)).toBe(40);
  });

  it('価格が0なら出さない', () => {
    expect(offeredCups({ lemonQty: 40, sugarQty: 80, price: 0 }, cap)).toBe(0);
  });

  it('静観なら出さない', () => {
    expect(offeredCups({ lemonQty: 0, sugarQty: 0, price: 100, watching: true }, cap)).toBe(0);
  });
});

describe('nextStock（在庫の繰り越し）', () => {
  it('市場に出した分の材料が減り、残りは繰り越す', () => {
    const r = nextStock({ lemon: 5, sugar: 10 }, 20, 40, 15, cfg);
    expect(r.usedLemon).toBe(15);
    expect(r.usedSugar).toBe(30);
    expect(r.stock).toEqual({ lemon: 10, sugar: 20 });
  });

  it('マイナスにはならない', () => {
    expect(nextStock({ lemon: 0, sugar: 0 }, 1, 1, 5, cfg).stock).toEqual({ lemon: 0, sugar: 0 });
  });
});

describe('sanitizeDecision', () => {
  it('負の数・小数・NaN は0以上の整数にする', () => {
    expect(sanitizeDecision({ lemonQty: -3, sugarQty: 2.7, price: Number.NaN })).toEqual({ lemonQty: 0, sugarQty: 2, price: 0 });
  });

  it('静観なら仕入れと販売を0にする', () => {
    expect(sanitizeDecision({ lemonQty: 10, sugarQty: 10, price: 100, watching: true }))
      .toEqual({ lemonQty: 0, sugarQty: 0, price: 0, maxSell: 0, watching: true });
  });
});
