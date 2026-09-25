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

  it('端数は提出順に、そのチームの上限まで渡す（旧版の動作）', () => {
    // 3チーム・合計10杯：均等割で3杯ずつ、残り1杯は1番目へ
    const sold = allocatePriceSegment(1000, [
      offer('A', 100, 50, 1), offer('B', 100, 2, 2), offer('C', 100, 50, 3),
    ]);
    // B は上限2杯なので均等割の3杯に届かない。残り 10-(3+2+3)=2杯は、提出順で A に全部渡る
    expect(toObj(sold)).toEqual({ A: 5, B: 2, C: 3 });
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
