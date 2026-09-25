// 購買の配分。初級は価格重視層のみ（旧版の runAuction と同じ仕組み）。

export interface Offer {
  teamId: string;
  price: number;
  offered: number; // 市場に出した杯数
  order: number; // 提出順
}

// 価格重視層：安い順に、予算の範囲で買う。
// 同じ価格のチームには均等に割り振り、割り切れない分は提出順に、そのチームの上限まで渡す。
// 戻り値は teamId → 売れた杯数。
export function allocatePriceSegment(budget: number, offers: Offer[]): Map<string, number> {
  const sold = new Map<string, number>(offers.map((o) => [o.teamId, 0]));
  // 安い順。同じ価格は提出順。それも同じなら渡された順（旧版の安定ソートと同じ）
  const market = offers
    .map((o, idx) => ({ ...o, idx }))
    .sort((a, b) => a.price - b.price || a.order - b.order || a.idx - b.idx);

  let rem = budget;
  let i = 0;
  while (i < market.length && rem > 0) {
    const price = market[i]!.price;
    if (price <= 0) {
      i++;
      continue;
    }
    const group: typeof market = [];
    while (i < market.length && market[i]!.price === price) {
      group.push(market[i]!);
      i++;
    }

    const totalGroupMax = group.reduce((a, g) => a + g.offered, 0);
    const totalToBuy = Math.min(totalGroupMax, Math.floor(rem / price));
    if (totalToBuy <= 0) continue;

    // まず均等割
    const baseEach = Math.floor(totalToBuy / group.length);
    const allocated = group.map((g) => Math.min(baseEach, g.offered));
    let remaining = totalToBuy - allocated.reduce((a, b) => a + b, 0);
    // 残りを提出順に、各チームの上限まで渡す
    for (let j = 0; j < group.length && remaining > 0; j++) {
      const extra = Math.min(group[j]!.offered - allocated[j]!, remaining);
      if (extra > 0) {
        allocated[j]! += extra;
        remaining -= extra;
      }
    }

    group.forEach((g, idx) => {
      sold.set(g.teamId, allocated[idx]!);
      rem -= allocated[idx]! * price;
    });
  }
  return sold;
}
