import { describe, expect, it } from 'vitest';
import { yearlySummary, yearOf } from '../engine/years';
import { clicker, playSolo, undercutter } from './balance';
import { HUMAN_ID, newSoloGame, nextSoloMonth, startNextYear, submitHuman } from './local-game';

const play = { lemonQty: 50, sugarQty: 50, price: 250 };

describe('ソロモードの年数（1〜10年）', () => {
  it('何も指定しなければ1年（今までと同じ）。年の決算は出さずに期末へ', () => {
    const a = newSoloGame({ seed: 'y1' });
    expect(a.config.months).toBe(12);
    expect(newSoloGame({ seed: 'y1', years: 1 })).toEqual(a);
    let s = a;
    for (let m = 1; m <= 12; m++) s = nextSoloMonth(submitHuman(s, play, 1));
    expect(s.phase).toBe('final');
  });

  it('3年なら36か月。12か月ごとに年の決算をはさみ、資金・在庫・バリスタを引き継ぐ', () => {
    let s = newSoloGame({ seed: 'y2', years: 3 });
    expect(s.config.months).toBe(36);
    const yearEnds: number[] = [];
    while (s.phase !== 'final') {
      if (s.phase === 'input') s = submitHuman(s, play, 1);
      else if (s.phase === 'result') s = nextSoloMonth(s);
      else {
        yearEnds.push(s.results[s.results.length - 1]!.month);
        // 決算のとき、次の年の1か月目の条件はもう決まっている
        expect(s.conditions.month).toBe(s.results.length + 1);
        const before = s.teams.find((t) => t.teamId === HUMAN_ID)!;
        s = startNextYear(s);
        expect(s.phase).toBe('input');
        expect(s.teams.find((t) => t.teamId === HUMAN_ID)).toEqual(before);
      }
    }
    expect(yearEnds).toEqual([12, 24]);
    expect(s.results).toHaveLength(36);
  });

  it('範囲の外は1〜10年にそろえる', () => {
    expect(newSoloGame({ seed: 'y3', years: 0 }).config.months).toBe(12);
    expect(newSoloGame({ seed: 'y3', years: 9 }).config.months).toBe(108);
    expect(newSoloGame({ seed: 'y3', years: 15 }).config.months).toBe(120);
  });

  it('5年でも最後まで動き、数値がおかしくならない。年ごとのまとめは5行', () => {
    for (const player of [clicker, undercutter]) {
      const { state } = playSolo(player, { seed: 'y4', difficulty: 'normal', pattern: 'realistic', years: 5 });
      expect(state.phase).toBe('final');
      expect(state.results).toHaveLength(60);
      for (const t of state.teams) expect(Number.isFinite(t.balance)).toBe(true);
      const rows = yearlySummary(state.results, state.teams, HUMAN_ID, state.config.recipe, state.config.startFund);
      expect(rows.map((r) => r.year)).toEqual([1, 2, 3, 4, 5]);
      // 年のはじめの資金は、前の年の終わりの資金
      for (let i = 1; i < rows.length; i++) expect(rows[i]!.startBalance).toBe(rows[i - 1]!.endBalance);
      expect(rows[4]!.endBalance).toBe(state.teams.find((t) => t.teamId === HUMAN_ID)!.balance);
      expect(rows.reduce((a, r) => a + r.profit, 0)).toBe(state.teams.find((t) => t.teamId === HUMAN_ID)!.totalProfit);
    }
  });

  it('人が脱落したら、残りの年は決算をはさまずにロボット店長だけで最後まで進める', () => {
    let s = newSoloGame({ seed: 'y5', years: 2, elimination: true });
    s = submitHuman(s, { lemonQty: 150, sugarQty: 150, price: 1_000_000 }, 3);
    s = nextSoloMonth(s);
    expect(s.phase).toBe('final');
    expect(s.results).toHaveLength(24);
    expect(yearOf(s.results[23]!.month)).toBe(2);
    // 営業した年だけがまとめに入る
    expect(yearlySummary(s.results, s.teams, HUMAN_ID, s.config.recipe, s.config.startFund)).toHaveLength(1);
  });
});
