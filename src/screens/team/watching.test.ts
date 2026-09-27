import { describe, expect, it } from 'vitest';
import { sanitizeDecision } from '../../engine/inventory';
import { DEFAULT_DECISION, initialInputValues } from './input-view';
import { isWatching } from './result-view';

describe('静観の翌月の入力画面', () => {
  it('静観（保存時は上限0杯）の翌月は、売る数の上限を持ち越さず、ふつうの初期値に戻す', () => {
    const saved = sanitizeDecision({ lemonQty: 0, sugarQty: 0, price: 0, watching: true });
    expect(saved.maxSell).toBe(0); // 保存される形
    const v = initialInputValues(saved, 1);
    expect(v.maxSell).toBeUndefined();
    expect(v.lemon).toBe(DEFAULT_DECISION.lemonQty);
    expect(v.sugar).toBe(DEFAULT_DECISION.sugarQty);
    expect(v.price).toBe(DEFAULT_DECISION.price);
  });

  it('ふつうの月の後は、前月の値（上限も）を引き継ぐ', () => {
    const v = initialInputValues({ lemonQty: 40, sugarQty: 45, price: 250, maxSell: 30 }, 2);
    expect(v).toEqual({ lemon: 40, sugar: 45, price: 250, maxSell: 30, barista: 2 });
  });
});

describe('結果の「静観」の表示', () => {
  it('仕入れも販売もしない月だけを静観とする', () => {
    expect(isWatching({ offered: 0, lemonBought: 0, sugarBought: 0 })).toBe(true);
    // 仕入れたのに作れなかった月（例：砂糖だけ0）は静観ではない
    expect(isWatching({ offered: 0, lemonBought: 50, sugarBought: 0 })).toBe(false);
    expect(isWatching({ offered: 30, lemonBought: 30, sugarBought: 30 })).toBe(false);
  });
});
