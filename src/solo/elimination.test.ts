import { describe, expect, it } from 'vitest';
import { isActive } from '../engine/month';
import { clicker, playSolo } from './balance';
import { HUMAN_ID, humanEliminatedMonth, newSoloGame, nextSoloMonth, submitHuman } from './local-game';

// まったく売れない値段で大量に仕入れる（1か月目で資金がマイナスになる）
const reckless = { lemonQty: 150, sugarQty: 150, price: 1_000_000 };

describe('ソロモードの脱落あり', () => {
  it('人が脱落したら、残りの月はロボット店長だけで進めて、期末になる', () => {
    let s = newSoloGame({ seed: 'e1', elimination: true });
    s = submitHuman(s, reckless, 3);
    expect(s.phase).toBe('result');
    expect(humanEliminatedMonth(s)).toBe(1);
    expect(s.results[0]!.teamResults.find((t) => t.teamId === HUMAN_ID)!.eliminated).toBe(true);

    s = nextSoloMonth(s);
    expect(s.phase).toBe('final');
    expect(s.results).toHaveLength(12);
    // 2か月目からは人の行はない
    for (const r of s.results.slice(1)) expect(r.teamResults.some((t) => t.teamId === HUMAN_ID)).toBe(false);
    // 脱落した人は、脱落したときの資金のまま
    expect(s.teams.find((t) => t.teamId === HUMAN_ID)!.balance).toBe(s.results[0]!.teamResults.find((t) => t.teamId === HUMAN_ID)!.balance);
  });

  it('脱落したあとは、人の決定を受け付けない', () => {
    let s = newSoloGame({ seed: 'e2', elimination: true });
    s = submitHuman(s, reckless, 3);
    const again = submitHuman({ ...s, phase: 'input' }, reckless, 3);
    expect(again.results).toHaveLength(1);
  });

  it('同じシードなら、脱落のあとの進み方も同じ', () => {
    const run = () => nextSoloMonth(submitHuman(newSoloGame({ seed: 'e3', elimination: true, teamCount: 6 }), reckless, 3));
    expect(run()).toEqual(run());
  });

  it('脱落なし（初期設定）なら、資金がマイナスでも続けられる', () => {
    let s = newSoloGame({ seed: 'e4' });
    s = submitHuman(s, reckless, 3);
    expect(humanEliminatedMonth(s)).toBeNull();
    expect(nextSoloMonth(s).phase).toBe('input');
  });

  it('脱落ありでも、ふつうに遊べば最後まで遊べる（ロボット店長が脱落しても止まらない）', () => {
    for (const teamCount of [3, 8]) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const { state } = playSolo(clicker, { seed: `e5-${teamCount}-${difficulty}`, difficulty, teamCount, elimination: true });
        expect(state.phase).toBe('final');
        expect(state.teams.some(isActive)).toBe(true);
      }
    }
  });
});
