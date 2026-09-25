import { describe, expect, it } from 'vitest';
import { legacySeededRand, monthRandom, seededRand } from '../random';
import { createLegacy } from './legacy/load-legacy';

const legacy = createLegacy();

describe('seededRand', () => {
  it('同じシードと番号なら同じ値を返す', () => {
    expect(seededRand('lemon', 101)).toBe(seededRand('lemon', 101));
  });

  it('0以上1未満の値を返す', () => {
    for (let n = 0; n < 5000; n++) {
      const v = seededRand('abc', n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('月が変わると値も変わる（旧版の欠陥がない）', () => {
    for (const seed of ['g1790312960315', 'lemon2025', 'x']) {
      const values = Array.from({ length: 12 }, (_, i) => seededRand(seed, (i + 1) * 100 + 1).toFixed(4));
      expect(new Set(values).size).toBe(12);
    }
  });

  it('シードと番号の区切りが混ざらない', () => {
    expect(seededRand('lemon1', 101)).not.toBe(seededRand('lemon', 1101));
  });

  it('値がかたよらない（10区間にほぼ均等に入る）', () => {
    const N = 20000;
    const buckets = new Array(10).fill(0);
    let sum = 0;
    for (let n = 0; n < N; n++) {
      const v = seededRand('dist', n);
      buckets[Math.floor(v * 10)]++;
      sum += v;
    }
    expect(sum / N).toBeGreaterThan(0.48);
    expect(sum / N).toBeLessThan(0.52);
    for (const b of buckets) {
      expect(b).toBeGreaterThan(N / 10 * 0.9);
      expect(b).toBeLessThan(N / 10 * 1.1);
    }
  });

  it('シードが違えば、同じ月でも値が変わる', () => {
    const values = ['a', 'b', 'c', 'd', 'e'].map((s) => seededRand(s, 101).toFixed(4));
    expect(new Set(values).size).toBe(5);
  });
});

describe('legacySeededRand（旧版の乱数。比較テスト用）', () => {
  it('旧版と完全に同じ値を返す', () => {
    const seeds = ['x', 'lemon2025', '1727236800000', 'テスト', ''];
    for (const seed of seeds) {
      for (let month = 1; month <= 12; month++) {
        for (let k = 1; k <= 6; k++) {
          const n = month * 100 + k;
          expect(legacySeededRand(seed, n)).toBe(legacy.seededRand(seed, n));
        }
      }
    }
  });

  it('旧版の欠陥：1〜9か月目の値がほとんど同じになる', () => {
    const values = Array.from({ length: 9 }, (_, i) => legacySeededRand('lemon2025', (i + 1) * 100 + 1).toFixed(4));
    expect(new Set(values).size).toBe(1);
  });
});

describe('monthRandom', () => {
  it('r(k) は rand(seed, month*100+k) と同じ', () => {
    expect(monthRandom('seed', 7)(3)).toBe(seededRand('seed', 703));
    expect(monthRandom('seed', 7, legacySeededRand)(3)).toBe(legacySeededRand('seed', 703));
  });
});
