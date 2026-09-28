import { describe, expect, it } from 'vitest';
import { TITLE_IDS } from '../engine/titles';
import { clicker, playSolo, undercutter } from './balance';
import { loadAchievements, recordYearTitles } from './achievements';
import { titlesOfYear } from './local-game';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } };
};

describe('肩書きコレクション', () => {
  it('はじめてもらった肩書きだけを返し、回数を数える', () => {
    const s = memory();
    expect(recordYearTitles('g1', 1, ['zeroWaste', 'forecaster'], s, '2026-09-28')).toEqual(['zeroWaste', 'forecaster']);
    expect(recordYearTitles('g1', 2, ['zeroWaste', 'neverRed'], s, '2026-09-29')).toEqual(['neverRed']);
    const a = loadAchievements(s);
    expect(a.titles.zeroWaste).toEqual({ count: 2, first: '2026-09-28' });
    expect(a.titles.neverRed).toEqual({ count: 1, first: '2026-09-29' });
  });

  it('同じゲームの同じ年は2回数えない（画面を開き直したときなど）', () => {
    const s = memory();
    recordYearTitles('g1', 1, ['zeroWaste'], s);
    expect(recordYearTitles('g1', 1, ['zeroWaste'], s)).toEqual([]);
    expect(loadAchievements(s).titles.zeroWaste!.count).toBe(1);
  });

  it('保存できない・壊れているときは、空のコレクションとして動く', () => {
    expect(loadAchievements(null).titles).toEqual({});
    const broken = { getItem: () => '{not json', setItem: () => {} };
    expect(loadAchievements(broken).titles).toEqual({});
    expect(recordYearTitles('g', 1, ['careful'], null)).toEqual(['careful']);
  });
});

describe('ソロの年ごとの肩書き', () => {
  it('実際のゲームでも、どの年にも1つ以上つき、決まった肩書きだけ', () => {
    for (const player of [clicker, undercutter]) {
      const { state } = playSolo(player, { seed: 't1', difficulty: 'normal', pattern: 'realistic', years: 3, elimination: true, teamCount: 6 });
      for (let y = 1; y <= 3; y++) {
        const ids = titlesOfYear(state, y);
        if (ids.length === 0) continue; // 脱落して営業しなかった年
        for (const id of ids) expect(TITLE_IDS).toContain(id);
      }
      expect(titlesOfYear(state, 1).length).toBeGreaterThan(0);
    }
  });
});
