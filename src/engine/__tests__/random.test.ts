import { describe, expect, it } from 'vitest';
import { monthRandom, seededRand } from '../random';
import { createLegacy } from './legacy/load-legacy';

const legacy = createLegacy();

describe('seededRand', () => {
  it('同じシードと番号なら同じ値を返す', () => {
    expect(seededRand('lemon', 101)).toBe(seededRand('lemon', 101));
  });

  it('0以上1以下の値を返す', () => {
    for (let n = 0; n < 2000; n++) {
      const v = seededRand('abc', n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('旧版と完全に同じ値を返す', () => {
    const seeds = ['x', 'lemon2025', '1727236800000', 'テスト', ''];
    for (const seed of seeds) {
      for (let month = 1; month <= 12; month++) {
        for (let k = 1; k <= 6; k++) {
          const n = month * 100 + k;
          expect(seededRand(seed, n)).toBe(legacy.seededRand(seed, n));
        }
      }
    }
  });

  it('旧版と同じく、シードと番号を文字列で連結する', () => {
    expect(seededRand('lemon1', 101)).toBe(seededRand('lemon', 1101));
  });
});

describe('monthRandom', () => {
  it('r(k) は seededRand(seed, month*100+k) と同じ', () => {
    const r = monthRandom('seed', 7);
    expect(r(3)).toBe(seededRand('seed', 703));
  });
});
