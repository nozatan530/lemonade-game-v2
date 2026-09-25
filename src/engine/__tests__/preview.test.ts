import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { initialTeamState, resolveMonth } from '../month';
import { previewDecision } from '../preview';

const config = defaultConfig(1, 's');
const prices = { lemon: 80, sugar: 10, barista: 2000 };

describe('previewDecision（入力中の見込み）', () => {
  it('作れる杯数・費用・全部売れたときの利益', () => {
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 40, sugarQty: 60, price: 200 }, 1, prices, config);
    expect(p.capacity.maxMake).toBe(40);
    expect(p.bottleneck).toBe('lemon');
    expect(p.offered).toBe(40);
    expect(p.costs.totalCost).toBe(40 * 80 + 60 * 10 + 2000);
    expect(p.revenueIfSoldOut).toBe(8000);
    expect(p.profitIfSoldOut).toBe(8000 - 5800);
    expect(p.leftover).toEqual({ lemon: 0, sugar: 20 });
  });

  it('バリスタが足りないときはバリスタが上限', () => {
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 100, sugarQty: 100, price: 200 }, 1, prices, config);
    expect(p.bottleneck).toBe('barista');
    expect(p.offered).toBe(50);
    expect(p.leftover).toEqual({ lemon: 50, sugar: 50 });
  });

  it('材料とバリスタがちょうど釣り合っていれば、足りないものはない', () => {
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 50, sugarQty: 50, price: 200 }, 1, prices, config);
    expect(p.capacity.maxMake).toBe(50);
    expect(p.bottleneck).toBeNull();
  });

  it('砂糖が一番少なければ砂糖が上限', () => {
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 40, sugarQty: 30, price: 200 }, 1, prices, config);
    expect(p.bottleneck).toBe('sugar');
  });

  it('全部売れたときの見込みは、実際の処理で全部売れたときの結果と同じ', () => {
    const team = { ...initialTeamState('A', 'A', config), stock: { lemon: 7, sugar: 3 } };
    const decision = { lemonQty: 30, sugarQty: 40, price: 150, maxSell: 35 };
    const p = previewDecision(team.stock, decision, team.baristaCount, prices, config);
    const { result } = resolveMonth(config, [team], { month: 2, marketBudget: 1_000_000, prices }, [
      { teamId: 'A', monthlyDecision: decision, order: 1 },
    ]);
    const r = result.teamResults[0]!;
    expect(r.sold).toBe(p.offered);
    expect(r.profit).toBe(p.profitIfSoldOut);
    expect(r.stock).toEqual(p.leftover);
  });
});
