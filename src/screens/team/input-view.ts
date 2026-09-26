// 毎月の入力画面。月が変わるまで作り直さず、入力中の値を保つ。
// ねらい：「いまの資金 → 支出 → 売上 → 月末の資金」を1本の流れで見せる。
//   ① 仕入れる（お金が出ていく）：単価 × 数量 ＝ 金額 を各行に出す
//   ② 売る（お金が入ってくる）：値段 × 作れる数、1杯あたりの原価、元がとれる数
//   画面の下に固定：いまの資金 − 支出 ＋ 売上 ＝ 月末の資金（売れた数しだいで幅がある）
// 計算はすべて engine の previewDecision。ここでは表示するだけ。

import { canChangeBarista } from '../../engine/config';
import { previewDecision } from '../../engine/preview';
import type { MonthlyDecision, TeamState } from '../../engine/types';
import type { Clock, PublicConfig, SubmissionDoc } from '../../sync/schema';
import { calendarMonth, esc, yen } from '../../ui/format';
import { stepper } from '../../ui/stepper';

export interface InputContext {
  pub: PublicConfig;
  clock: Clock;
  me: TeamState;
  ownSub: SubmissionDoc | null; // 今月の自分の提出
  closed: boolean; // 締切を過ぎた
}

export interface InputView {
  update(ctx: InputContext): void;
}

export const DEFAULT_DECISION: MonthlyDecision = { lemonQty: 50, sugarQty: 50, price: 300 };

export function mountInputView(
  container: HTMLElement,
  initial: InputContext,
  startValues: { decision: MonthlyDecision; baristaCount: number },
  onSubmit: (decision: MonthlyDecision, baristaCount: number | undefined) => Promise<void>,
  options: { submitLabel?: string } = {}, // ソロモードでは「この決定で1か月すすめる」
): InputView {
  const submitLabel = options.submitLabel ?? '提出する';
  let ctx = initial;
  const v = {
    lemon: startValues.decision.watching ? DEFAULT_DECISION.lemonQty : startValues.decision.lemonQty,
    sugar: startValues.decision.watching ? DEFAULT_DECISION.sugarQty : startValues.decision.sugarQty,
    price: startValues.decision.price > 0 ? startValues.decision.price : DEFAULT_DECISION.price,
    maxSell: startValues.decision.maxSell as number | undefined,
    barista: startValues.baristaCount,
  };
  const { prices } = ctx.clock;
  const { recipe, baristaCapacity } = ctx.pub;
  const canChooseBarista = ctx.clock.quarterStart;
  // バリスタを決められる月（3か月ごとなら 4・7・10・1月など。毎月なら「毎月」）
  const cadence = ctx.pub.baristaCadence ?? 'quarterly';
  const baristaMonths = cadence === 'monthly' ? '毎月' : Array.from({ length: ctx.pub.months }, (_, i) => i + 1)
    .filter((m) => canChangeBarista(m, cadence))
    .map((m) => calendarMonth(m, ctx.pub.startCalendarMonth))
    .join('・') + '月';

  container.innerHTML = `
    ${ctx.clock.message ? `<div class="notice">📰 ${esc(ctx.clock.message)}</div>` : ''}
    <p class="muted" style="margin:0 0 10px">1杯＝レモン${recipe.lemon}個＋砂糖${recipe.sugar}袋。バリスタ1人で1か月に${baristaCapacity}杯まで作れます。
      <span id="stock"></span></p>

    <div class="card">
      <h2>① 仕入れる <span class="muted">（お金が出ていく）</span></h2>
      <div id="buy"></div>
      <div id="baristaFixed"></div>
      <div class="subtotal"><span>支出の合計</span><strong id="spend"></strong></div>
    </div>

    <div class="card">
      <h2>② 売る <span class="muted">（お金が入ってくる）</span></h2>
      <div id="sell"></div>
      <div id="warn"></div>
      <table class="pl compact">
        <tr><td>作れる数</td><td id="make"></td></tr>
        <tr><td>1杯あたりの原価<span class="explain" id="costBreakdown"></span></td><td id="costPerCup"></td></tr>
        <tr><td>1杯売ったときのもうけ</td><td id="margin"></td></tr>
        <tr><td>元がとれる数<span class="explain">今月の支出を取り戻すのに売る数</span></td><td id="breakEven"></td></tr>
      </table>
      <details id="maxSellBox"><summary>くわしく：売る数の上限を決める（ふつうは不要）</summary>
        <p class="muted" style="margin:4px 0">上限を決めると、残った材料を来月に回せます。空にすると作れるだけ売ります。</p>
        <div class="stepper"><div class="label">🥤 売る数の上限<small>杯（空＝作れるだけ）</small></div>
          <div class="ctrl"><input type="number" inputmode="numeric" min="0" id="maxsell" placeholder="—"></div></div>
      </details>
      <p class="muted" style="margin:8px 0 0">お客さんは安いお店から順に買います。高すぎると売れ残るかも。売れ残った分は捨てることになります。
        <span id="leftover"></span></p>
    </div>

    <div id="status"></div>
    <button class="btn secondary" id="watch" type="button">今月は静観する（売らない）</button>
    <div class="cashbar-spacer"></div>

    <div class="cashbar" role="region" aria-label="月末の資金の見込み">
      <div class="cashbar-inner">
        <div class="cash-row"><span>いまの資金</span><span id="cashNow"></span></div>
        <div class="cash-row"><span>− 支出</span><span id="cashSpend"></span></div>
        <div class="cash-row"><span>＋ 売上 <small class="muted">売れた数しだい</small></span><span id="cashSales"></span></div>
        <div class="cash-row total"><span>＝ 月末の資金</span><span id="cashEnd"></span></div>
        <p class="cash-note" id="cashNote"></p>
        <button class="btn" id="submit" type="button">${esc(submitLabel)}</button>
      </div>
    </div>
  `;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;
  const submitBtn = $<HTMLButtonElement>('submit');
  const watchBtn = $<HTMLButtonElement>('watch');

  const lemonStep = stepper({ label: '🍋 レモン', value: v.lemon, step: 10, onChange: (x) => { v.lemon = x; refresh(); } });
  const sugarStep = stepper({ label: '🍬 砂糖', value: v.sugar, step: 10, onChange: (x) => { v.sugar = x; refresh(); } });
  const baristaStep = canChooseBarista
    ? stepper({ label: '👩‍🍳 バリスタ', value: v.barista, step: 1, max: 20, onChange: (x) => { v.barista = x; refresh(); } })
    : null;
  const priceStep = stepper({ label: '💰 1杯の値段', value: v.price, step: 10, max: 10000, onChange: (x) => { v.price = x; refresh(); } });
  $('buy').append(lemonStep.el, sugarStep.el, ...(baristaStep ? [baristaStep.el] : []));
  $('sell').append(priceStep.el);
  const steppers = [lemonStep, sugarStep, priceStep, ...(baristaStep ? [baristaStep] : [])];

  const maxSellInput = $<HTMLInputElement>('maxsell');
  if (v.maxSell !== undefined) {
    maxSellInput.value = String(v.maxSell);
    $<HTMLDetailsElement>('maxSellBox').open = true;
  }
  maxSellInput.addEventListener('input', () => {
    v.maxSell = maxSellInput.value === '' ? undefined : Math.max(0, Math.floor(Number(maxSellInput.value)));
    refresh();
  });

  const baristaNow = () => (canChooseBarista ? v.barista : ctx.me.baristaCount);
  const decisionNow = (): MonthlyDecision => ({
    lemonQty: v.lemon, sugarQty: v.sugar, price: v.price, ...(v.maxSell !== undefined ? { maxSell: v.maxSell } : {}),
  });
  // 改行するなら「＝」の前で（金額が式から離れないように）
  const times = (unit: number, qty: number, unitLabel: string, amount: number) =>
    `<span class="nowrap">${yen(unit)} × ${qty}${unitLabel}</span> <span class="nowrap">＝ <strong>${yen(amount)}</strong></span>`;

  function refresh() {
    const me = ctx.me;
    const b = baristaNow();
    const p = previewDecision(me.stock, decisionNow(), b, prices, ctx.pub, me.balance);

    $('stock').textContent = me.stock.lemon > 0 || me.stock.sugar > 0
      ? `先月の残り：🍋${me.stock.lemon}個・🍬${me.stock.sugar}袋（先に使います）` : '';

    // ① 仕入れる
    lemonStep.setHint(times(prices.lemon, v.lemon, '個', p.costs.costLemon));
    sugarStep.setHint(times(prices.sugar, v.sugar, '袋', p.costs.costSugar));
    const baristaLine = `${times(prices.barista, b, '人', p.costs.costBarista)}<br><span class="muted">${cadence === 'monthly' ? '人数は毎月変えられます' : `人数を決める月：${esc(baristaMonths)}`}</span>`;
    if (baristaStep) baristaStep.setHint(baristaLine);
    else $('baristaFixed').innerHTML = `<div class="fixed-row"><div class="label">👩‍🍳 バリスタ<small>${baristaLine}</small></div></div>`;
    $('spend').textContent = yen(p.costs.totalCost);

    // ② 売る
    priceStep.setHint(p.offered > 0
      ? `<span class="nowrap">× ${p.offered}杯</span> <span class="nowrap">＝ <strong>${yen(p.revenueIfSoldOut)}</strong></span><br><span class="muted">（全部売れたら）</span>`
      : '作れる数が0杯なので売れません');
    const limit = p.capacity.maxMake === 0 ? ''
      : p.bottleneck === 'barista' ? `バリスタ${b}人で${p.capacity.capBarista}杯まで`
      : p.bottleneck === 'lemon' ? 'レモンが足りない'
      : p.bottleneck === 'sugar' ? '砂糖が足りない' : '材料もバリスタもぴったり';
    $('make').innerHTML = `${p.capacity.maxMake}杯${limit ? ` <span class="muted">（${limit}）</span>` : ''}` +
      (p.offered < p.capacity.maxMake ? `<br><span class="muted">お店に出すのは${p.offered}杯</span>` : '');
    $('warn').innerHTML = b === 0 ? '<p class="bad">⚠️ バリスタが0人なので作れません。</p>'
      : p.capacity.maxMake === 0 ? '<p class="bad">⚠️ 材料がないので作れません。</p>' : '';
    $('costBreakdown').textContent = p.laborPerCup !== null
      ? `材料${yen(p.materialPerCup)}＋給料${yen(p.laborPerCup)}（${yen(p.costs.costBarista)}÷${p.offered}杯）` : '';
    $('costPerCup').textContent = p.costPerCup !== null ? yen(p.costPerCup) : '—';
    $('margin').innerHTML = p.marginPerCup !== null
      ? `<span class="${p.marginPerCup >= 0 ? 'good' : 'bad'}">${p.marginPerCup >= 0 ? '' : '−'}${yen(Math.abs(p.marginPerCup))}</span>` : '—';
    $('breakEven').innerHTML = p.breakEvenCups === null ? '—'
      : p.breakEvenReachable ? `${p.breakEvenCups}杯 <span class="muted">（${p.offered}杯中）</span>`
      : `<span class="bad">全部売れても届かない</span>`;
    $('leftover').textContent = p.leftover.lemon > 0 || p.leftover.sugar > 0
      ? `使わない材料（🍋${p.leftover.lemon}個・🍬${p.leftover.sugar}袋）は来月に残ります。` : '';

    // 画面の下：月末の資金
    $('cashNow').textContent = yen(me.balance);
    $('cashSpend').textContent = `− ${yen(p.costs.totalCost)}`;
    $('cashSales').textContent = p.revenueIfSoldOut > 0 ? `＋ ¥0 〜 ${yen(p.revenueIfSoldOut)}` : '＋ ¥0';
    const low = p.balanceIfNoneSold;
    const high = p.balanceIfSoldOut;
    $('cashEnd').innerHTML = low === high
      ? `<strong class="${high < 0 ? 'bad' : ''}">${yen(high)}</strong>`
      : `<strong class="${low < 0 ? 'bad' : ''}">${yen(low)}</strong> 〜 <strong class="good">${yen(high)}</strong>`;
    $('cashNote').innerHTML = high < 0
      ? '<span class="bad">⚠️ 全部売れても、お金がマイナスになります</span>'
      : low < 0
      ? '<span class="bad">⚠️ 売れなかったら、お金がマイナスになります</span>'
      : low === high ? '' : '1杯も売れなかったら左、全部売れたら右';

    const sub = ctx.ownSub;
    $('status').innerHTML = ctx.closed
      ? '<div class="notice">⏰ 締め切りました。結果を待っています…</div>'
      : sub
        ? `<div class="notice">✅ 提出しました（${sub.monthlyDecision.watching ? '静観' : `${yen(sub.monthlyDecision.price)}で販売`}）。締切までは出し直せます。</div>`
        : '';
    submitBtn.textContent = sub ? '出し直す' : submitLabel;
    submitBtn.disabled = ctx.closed;
    watchBtn.disabled = ctx.closed;
    steppers.forEach((s) => s.setDisabled(ctx.closed));
    maxSellInput.disabled = ctx.closed;
  }

  async function send(decision: MonthlyDecision) {
    submitBtn.disabled = watchBtn.disabled = true;
    try {
      await onSubmit(decision, canChooseBarista ? v.barista : undefined);
    } catch {
      alert('提出できませんでした。締切を過ぎたか、通信がとぎれた可能性があります。');
    } finally {
      if (container.contains(submitBtn)) refresh();
    }
  }

  const WATCHING: MonthlyDecision = { lemonQty: 0, sugarQty: 0, price: 0, watching: true };

  submitBtn.addEventListener('click', () => {
    if (v.price <= 0) {
      // 価格0では売れないので、静観にするか確認する
      if (confirm('値段が0円です。今月は静観にしますか？\n（材料は買わず、売りません。バリスタの給料はかかります）')) send(WATCHING);
      return;
    }
    send(decisionNow());
  });
  watchBtn.addEventListener('click', () => {
    if (confirm('今月は静観にしますか？\n材料は買わず、売りません。バリスタの給料はかかります。')) send(WATCHING);
  });

  refresh();
  return {
    update(next) {
      ctx = next;
      if (container.contains(submitBtn)) refresh();
    },
  };
}
