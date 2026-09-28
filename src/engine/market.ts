// 購買の配分。初級は価格重視層のみ（旧版の runAuction と同じ仕組み）。

export interface Offer {
  teamId: string;
  price: number;
  offered: number; // 市場に出した杯数
  order: number; // 提出順
}

// 価格重視層：安い順に、予算の範囲で買う。
// 同じ価格のチームには均等に割り振る。作った数が少なくて均等割に届かないチームがあれば、
// その余りは、まだ売れるチームで均等に分け直す（くり返す）。
// 最後に割り切れない1杯ずつは、提出順に1杯ずつ渡す（同じ価格のチームどうしの差は多くても1杯）。
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

    const allocated = group.map(() => 0);
    let remaining = totalToBuy;
    // 均等割：まだ売れるチームで分け、上限に届いたチームの余りは次の回で分け直す
    for (;;) {
      const open = group.map((_, j) => j).filter((j) => allocated[j]! < group[j]!.offered);
      const each = open.length > 0 ? Math.floor(remaining / open.length) : 0;
      if (each === 0) break;
      for (const j of open) {
        const add = Math.min(each, group[j]!.offered - allocated[j]!);
        allocated[j]! += add;
        remaining -= add;
      }
    }
    // 割り切れない分は、提出順に1杯ずつ
    for (let j = 0; j < group.length && remaining > 0; j++) {
      if (allocated[j]! < group[j]!.offered) {
        allocated[j]!++;
        remaining--;
      }
    }

    group.forEach((g, idx) => {
      sold.set(g.teamId, allocated[idx]!);
      rem -= allocated[idx]! * price;
    });
  }
  return sold;
}
