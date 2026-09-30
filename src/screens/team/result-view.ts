// 静観した月か。静観は仕入れも販売もしない月（仕入れたのに作れなかった月は静観ではない）
export function isWatching(r: { offered: number; lemonBought: number; sugarBought: number }): boolean {
  return r.offered === 0 && r.lemonBought === 0 && r.sugarBought === 0;
}
