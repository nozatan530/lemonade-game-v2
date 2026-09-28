import { describe, expect, it } from 'vitest';
import { isYearEnd, monthInYear, standingsAt, yearOf, yearsOf } from '../years';
import type { MonthResult, TeamState } from '../types';

describe('年の区切り', () => {
  it('通しの月から、何年目・その年の何か月目か', () => {
    expect([1, 12, 13, 24, 60].map(yearOf)).toEqual([1, 1, 2, 2, 5]);
    expect([1, 12, 13, 24, 60].map(monthInYear)).toEqual([1, 12, 1, 12, 12]);
    expect([11, 12, 13, 36].map(isYearEnd)).toEqual([false, true, false, true]);
    expect(yearsOf({ months: 36 })).toBe(3);
    expect(yearsOf({ months: 6 })).toBe(1);
  });

  it('ある月の終わりの時点の資金・もうけ・脱落', () => {
    const tr = (teamId: string, balance: number, profit: number) => ({ teamId, balance, profit }) as MonthResult['teamResults'][number];
    const results = [
      { month: 1, teamResults: [tr('a', 12000, 2000), tr('b', 9000, -1000)] },
      { month: 2, teamResults: [tr('a', 15000, 3000), tr('b', -500, -9500)] },
      { month: 3, teamResults: [tr('a', 16000, 1000)] },
    ] as MonthResult[];
    const teams = [
      { teamId: 'a', balance: 16000, totalProfit: 6000 },
      { teamId: 'b', balance: -500, totalProfit: -10500, eliminatedMonth: 2 },
    ] as TeamState[];
    const at1 = standingsAt(results, teams, 1, 10000);
    expect(at1.map((t) => [t.balance, t.totalProfit, t.eliminatedMonth])).toEqual([[12000, 2000, undefined], [9000, -1000, undefined]]);
    const at3 = standingsAt(results, teams, 3, 10000);
    expect(at3.map((t) => [t.balance, t.totalProfit, t.eliminatedMonth])).toEqual([[16000, 6000, undefined], [-500, -10500, 2]]);
  });
});
