// シード付き乱数。状態を持たず、(シード, 番号) から毎回同じ値を返す（もしもリプレイと検証のため）。

export type SeededRand = (seed: string, n: number) => number;

// 0 以上 1 未満。シードと番号をそれぞれよく混ぜてから組み合わせるので、
// 番号が1違うだけでも値は大きく変わり、シードと番号の区切りも混ざらない。
export const seededRand: SeededRand = (seed, n) => {
  const h = fmix32(hashString(seed) ^ fmix32((Math.imul(n | 0, 0x9e3779b1) + 0x7f4a7c15) | 0));
  return h / 4294967296;
};

// 旧版（legacy/index.html）の乱数。旧版との比較テストのためだけに残す。
// 文字列をそのまま多項式で数値にしているだけなので、番号が近いとほぼ同じ値になる欠陥がある
// （1〜9か月目の値がほとんど同じになる）。ゲームでは使わない。docs/decisions.md 参照。
export const legacySeededRand: SeededRand = (seed, n) => {
  let h = 0;
  const s = String(seed) + String(n);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 0xffffffff;
};

// ある月の k 番目の乱数（旧版の r(k) = seededRand(seed, month*100+k) と同じ番号の付け方）
export function monthRandom(seed: string, month: number, rand: SeededRand = seededRand): (k: number) => number {
  return (k) => rand(seed, month * 100 + k);
}

// FNV-1a
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// MurmurHash3 の仕上げ（ビットをよく混ぜる）
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
