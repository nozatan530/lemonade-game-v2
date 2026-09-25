// シード付き乱数。状態を持たず、(シード, 番号) から毎回同じ値を返す。
// 旧版（legacy/index.html の seededRand）とビット単位で同じ結果になるように移植している。
// 旧版の性質もそのまま引き継ぐ：
// - 0 以上 1 以下（まれに 1 ちょうどを返す）
// - シードと番号を文字列として連結するため、("lemon1", 101) と ("lemon", 1101) は同じ値になる

export function seededRand(seed: string, n: number): number {
  let h = 0;
  const s = String(seed) + String(n);
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0) / 0xffffffff;
}

// ある月の k 番目の乱数（旧版の r(k) = seededRand(seed, month*100+k) と同じ）
export function monthRandom(seed: string, month: number): (k: number) => number {
  return (k) => seededRand(seed, month * 100 + k);
}
