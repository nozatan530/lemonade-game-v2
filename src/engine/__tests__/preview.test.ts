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

  it('1杯あたりの原価・もうけ・元がとれる数・月末の資金の見込み', () => {
    // レモン50・砂糖50・バリスタ1人、300円、いまの資金 10,000円
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 50, sugarQty: 50, price: 300 }, 1, prices, config, 10000);
    expect(p.materialPerCup).toBe(90);
    expect(p.laborPerCup).toBe(40); // 2,000円 ÷ 50杯
    expect(p.costPerCup).toBe(130);
    expect(p.marginPerCup).toBe(170);
    expect(p.costs.totalCost).toBe(6500);
    expect(p.breakEvenCups).toBe(22); // 6,500円 ÷ 300円 = 21.7 → 22杯
    expect(p.breakEvenReachable).toBe(true);
    expect(p.balanceIfNoneSold).toBe(3500);
    expect(p.balanceIfSoldOut).toBe(18500);
  });

  it('作る数が少ないと、1杯あたりの給料が上がる', () => {
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 20, sugarQty: 20, price: 300 }, 1, prices, config);
    expect(p.laborPerCup).toBe(100); // 2,000円 ÷ 20杯
    expect(p.costPerCup).toBe(190);
  });

  it('全部売れても元がとれないときがわかる', () => {
    const p = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 50, sugarQty: 50, price: 100 }, 1, prices, config, 10000);
    expect(p.breakEvenCups).toBe(65);
    expect(p.breakEvenReachable).toBe(false);
    expect(p.balanceIfSoldOut).toBe(10000 - 6500 + 5000);
  });

  it('店に出さない（静観・バリスタ0人）ときは1杯あたりの値は出さない。月末の資金は支出の分だけ減る', () => {
    const watch = previewDecision({ lemon: 0, sugar: 0 }, { lemonQty: 0, sugarQty: 0, price: 0, watching: true }, 1, prices, config, 10000);
    expect(watch.offered).toBe(0);
    expect(watch.costPerCup).toBeNull();
    expect(watch.breakEvenCups).toBeNull();
    expect(watch.balanceIfNoneSold).toBe(8000);
    expect(watch.balanceIfSoldOut).toBe(8000);
  });

  it('月末の資金の見込みは、実際の処理の結果（全部売れた・1杯も売れない）と一致する', () => {
    const team = { ...initialTeamState('A', 'A', config), stock: { lemon: 10, sugar: 0 } };
    const decision = { lemonQty: 30, sugarQty: 40, price: 200 };
    const p = previewDecision(team.stock, decision, team.baristaCount, prices, config, team.balance);
    const run = (budget: number) => resolveMonth(config, [team], { month: 2, marketBudget: budget, prices }, [
      { teamId: 'A', monthlyDecision: decision, order: 1 },
    ]).result.teamResults[0]!.balance;
    expect(run(1_000_000)).toBe(p.balanceIfSoldOut);
    expect(run(0)).toBe(p.balanceIfNoneSold);
  });
});

