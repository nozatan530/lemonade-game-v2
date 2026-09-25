// データベースとの変換。
// - 書き込み：undefined を含むと書き込みが失敗するので取り除く
// - 読み込み：配列は、要素が消えたり連番キーの扱いで、オブジェクトとして返ることがある。空のオブジェクトは消える

export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

// 配列として書いたものを配列に戻す（オブジェクトで返ってきた場合も、キーの順に並べる）
export function asArray<T>(value: unknown): T[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v) => v != null) as T[];
  return Object.keys(value as object)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (value as Record<string, T>)[k]!);
}

export function asRecord<T>(value: unknown): Record<string, T> {
  return (value ?? {}) as Record<string, T>;
}
