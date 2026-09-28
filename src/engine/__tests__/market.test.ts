import { describe, expect, it } from 'vitest';
import { allocatePriceSegment, type Offer } from '../market';

const offer = (teamId: string, price: number, offered: number, order: number): Offer => ({ teamId, price, offered, order });
const toObj = (m: Map<string, number>) => Object.fromEntries(m);

describe('allocatePriceSegment（価格重視層）', () => {
  it('安いチームから順に売れる', () => {
    const sold = allocatePriceSegment(3000, [offer('A', 200, 10, 1), offer('B', 100, 10, 2)]);
    // B: 10杯 × 100円 = 1,000円、残り 2,000円で A が 10杯
    expect(toObj(sold)).toEqual({ A: 10, B: 10 });
  });

  it('予算が尽きたら、高いチームは売れない', () => {
    const sold = allocatePriceSegment(1500, [offer('A', 200, 10, 1), offer('B', 100, 10, 2)]);
    // B: 1,000円、残り 500円で A は 2杯
    expect(toObj(sold)).toEqual({ A: 2, B: 10 });
  });

  it('同じ価格なら均等に割り振る', () => {
    const sold = allocatePriceSegment(2000, [offer('A', 100, 50, 1), offer('B', 100, 50, 2)]);
    expect(toObj(sold)).toEqual({ A: 10, B: 10 });
  });

  it('割り切れない分は先に提出したチームへ', () => {
    const sold = allocatePriceSegment(1100, [offer('A', 100, 50, 2), offer('B', 100, 50, 1)]);
    // 11杯を2チームで：5杯ずつ、残り1杯は先に提出した B へ
    expect(toObj(sold)).toEqual({ A: 5, B: 6 });
  });

  it('均等割に届かないチームの余りは、ほかのチームで均等に分け直す', () => {
    // 3チーム・合計10杯。B は2杯しか作っていないので、残り8杯を A と C で4杯ずつ
    const sold = allocatePriceSegment(1000, [
      offer('A', 100, 50, 1), offer('B', 100, 2, 2), offer('C', 100, 50, 3),
    ]);
    expect(toObj(sold)).toEqual({ A: 4, B: 2, C: 4 });
  });

  it('分け直しが何回も続いても、差は多くても1杯', () => {
    // 合計23杯を4チームで。B は1杯、C は3杯しか作っていない → A と D で残り19杯（10と9）
    const sold = allocatePriceSegment(2300, [
      offer('A', 100, 50, 1), offer('B', 100, 1, 2), offer('C', 100, 3, 3), offer('D', 100, 50, 4),
    ]);
    expect(toObj(sold)).toEqual({ A: 10, B: 1, C: 3, D: 9 });
  });

  it('割り切れない1杯ずつは、提出順に1杯ずつ（1チームにまとめない）', () => {
    // 合計11杯を4チームで：2杯ずつ、残り3杯を提出順に1杯ずつ
    const sold = allocatePriceSegment(1100, [
      offer('A', 100, 50, 4), offer('B', 100, 50, 1), offer('C', 100, 50, 2), offer('D', 100, 50, 3),
    ]);
    expect(toObj(sold)).toEqual({ A: 2, B: 3, C: 3, D: 3 });
  });

  it('市場に出していない（価格0の）チームは売れない', () => {
    const sold = allocatePriceSegment(5000, [offer('A', 0, 0, 1), offer('B', 100, 10, 2)]);
    expect(toObj(sold)).toEqual({ A: 0, B: 10 });
  });

  it('予算が1杯分に満たなければ誰も売れない', () => {
    const sold = allocatePriceSegment(99, [offer('A', 100, 10, 1)]);
    expect(toObj(sold)).toEqual({ A: 0 });
  });
});
