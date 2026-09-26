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
import { t } from '../../i18n';
import { newsText } from '../../i18n/content';
import { esc, monthShort, yen } from '../../ui/format';
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
  const submitLabel = options.submitLabel ?? t('input.submit');
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
  const baristaMonths = Array.from({ length: ctx.pub.months }, (_, i) => i + 1)
    .filter((m) => canChangeBarista(m, cadence))
    .map((m) => monthShort(m, ctx.pub.startCalendarMonth))
    .join(', ');

  container.innerHTML = `
    ${ctx.clock.message ? `<div class="notice">📰 ${esc(newsText(ctx.clock.message))}</div>` : ''}
    <p class="muted" style="margin:0 0 10px">${t('input.recipe', { lemon: recipe.lemon, sugar: recipe.sugar, cap: baristaCapacity })}
      <span id="stock"></span></p>

    <div class="card">
      <h2>${t('input.buy.h2')} <span class="muted">${t('input.buy.sub')}</span></h2>
      <div id="buy"></div>
      <div id="baristaFixed"></div>
      <div class="subtotal"><span>${t('input.spend')}</span><strong id="spend"></strong></div>
    </div>

    <div class="card">
      <h2>${t('input.sell.h2')} <span class="muted">${t('input.sell.sub')}</span></h2>
      <div id="sell"></div>
      <div id="warn"></div>
      <table class="pl compact">
        <tr><td>${t('input.make')}</td><td id="make"></td></tr>
        <tr><td>${t('input.costPerCup')}<span class="explain" id="costBreakdown"></span></td><td id="costPerCup"></td></tr>
        <tr><td>${t('input.margin')}</td><td id="margin"></td></tr>
        <tr><td>${t('input.breakEven')}<span class="explain">${t('input.breakEven.explain')}</span></td><td id="breakEven"></td></tr>
      </table>
      <details id="maxSellBox"><summary>${t('input.maxSell.summary')}</summary>
        <p class="muted" style="margin:4px 0">${t('input.maxSell.help')}</p>
        <div class="stepper"><div class="label">${t('input.maxSell.label')}<small>${t('input.maxSell.hint')}</small></div>
          <div class="ctrl"><input type="number" inputmode="numeric" min="0" id="maxsell" placeholder="—"></div></div>
      </details>
      <p class="muted" style="margin:8px 0 0">${t('input.customers')}
        <span id="leftover"></span></p>
    </div>

    <div id="status"></div>
    <button class="btn secondary" id="watch" type="button">${t('input.watch')}</button>
    <div class="cashbar-spacer"></div>

    <div class="cashbar" role="region" aria-label="${t('input.cash.aria')}">
      <div class="cashbar-inner">
        <div class="cash-row"><span>${t('input.cash.now')}</span><span id="cashNow"></span></div>
        <div class="cash-row"><span>${t('input.cash.spend')}</span><span id="cashSpend"></span></div>
        <div class="cash-row"><span>${t('input.cash.sales')} <small class="muted">${t('input.cash.salesNote')}</small></span><span id="cashSales"></span></div>
        <div class="cash-row total"><span>${t('input.cash.end')}</span><span id="cashEnd"></span></div>
        <p class="cash-note" id="cashNote"></p>
        <button class="btn" id="submit" type="button">${esc(submitLabel)}</button>
      </div>
    </div>
  `;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;
  const submitBtn = $<HTMLButtonElement>('submit');
  const watchBtn = $<HTMLButtonElement>('watch');

  const lemonStep = stepper({ field: 'lemon', label: t('input.lemon'), value: v.lemon, step: 10, onChange: (x) => { v.lemon = x; refresh(); } });
  const sugarStep = stepper({ field: 'sugar', label: t('input.sugar'), value: v.sugar, step: 10, onChange: (x) => { v.sugar = x; refresh(); } });
  const baristaStep = canChooseBarista
    ? stepper({ field: 'barista', label: t('input.barista'), value: v.barista, step: 1, max: 20, onChange: (x) => { v.barista = x; refresh(); } })
    : null;
  const priceStep = stepper({ field: 'price', label: t('input.price'), value: v.price, step: 10, max: 10000, onChange: (x) => { v.price = x; refresh(); } });
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
  const times = (unit: number, qtyText: string, amount: number) =>
    `<span class="nowrap">${yen(unit)} × ${qtyText}</span> <span class="nowrap">＝ <strong>${yen(amount)}</strong></span>`;

  function refresh() {
    const me = ctx.me;
    const b = baristaNow();
    const p = previewDecision(me.stock, decisionNow(), b, prices, ctx.pub, me.balance);

    $('stock').textContent = me.stock.lemon > 0 || me.stock.sugar > 0
      ? t('input.stock', { lemon: me.stock.lemon, sugar: me.stock.sugar }) : '';

    // ① 仕入れる
    lemonStep.setHint(times(prices.lemon, t('input.qty.lemon', { n: v.lemon }), p.costs.costLemon));
    sugarStep.setHint(times(prices.sugar, t('input.qty.sugar', { n: v.sugar }), p.costs.costSugar));
    const baristaLine = `${times(prices.barista, t('input.qty.barista', { n: b }), p.costs.costBarista)}<br><span class="muted">${cadence === 'monthly' ? t('input.baristaMonthly') : t('input.baristaMonths', { months: esc(baristaMonths) })}</span>`;
    if (baristaStep) baristaStep.setHint(baristaLine);
    else $('baristaFixed').innerHTML = `<div class="fixed-row"><div class="label">${t('input.barista')}<small>${baristaLine}</small></div></div>`;
    $('spend').textContent = yen(p.costs.totalCost);

    // ② 売る
    priceStep.setHint(p.offered > 0
      ? `<span class="nowrap">× ${t('input.cups', { n: p.offered })}</span> <span class="nowrap">＝ <strong>${yen(p.revenueIfSoldOut)}</strong></span><br><span class="muted">${t('input.ifSoldOut')}</span>`
      : t('input.cannotSell'));
    const limit = p.capacity.maxMake === 0 ? ''
      : p.bottleneck === 'barista' ? t('input.limit.barista', { b, cap: p.capacity.capBarista })
      : p.bottleneck === 'lemon' ? t('input.limit.lemon')
      : p.bottleneck === 'sugar' ? t('input.limit.sugar') : t('input.limit.exact');
    $('make').innerHTML = `${t('input.cups', { n: p.capacity.maxMake })}${limit ? ` <span class="muted">(${limit})</span>` : ''}` +
      (p.offered < p.capacity.maxMake ? `<br><span class="muted">${t('input.offered', { n: p.offered })}</span>` : '');
    $('warn').innerHTML = b === 0 ? `<p class="bad">${t('input.warn.noBarista')}</p>`
      : p.capacity.maxMake === 0 ? `<p class="bad">${t('input.warn.noIngredient')}</p>` : '';
    $('costBreakdown').textContent = p.laborPerCup !== null
      ? t('input.costBreakdown', { m: yen(p.materialPerCup), l: yen(p.laborPerCup), w: yen(p.costs.costBarista), n: p.offered }) : '';
    $('costPerCup').textContent = p.costPerCup !== null ? yen(p.costPerCup) : '—';
    $('margin').innerHTML = p.marginPerCup !== null
      ? `<span class="${p.marginPerCup >= 0 ? 'good' : 'bad'}">${p.marginPerCup >= 0 ? '' : '−'}${yen(Math.abs(p.marginPerCup))}</span>` : '—';
    $('breakEven').innerHTML = p.breakEvenCups === null ? '—'
      : p.breakEvenReachable ? t('input.breakEven.value', { n: p.breakEvenCups, of: p.offered })
      : `<span class="bad">${t('input.breakEven.unreachable')}</span>`;
    $('leftover').textContent = p.leftover.lemon > 0 || p.leftover.sugar > 0
      ? t('input.leftover', { lemon: p.leftover.lemon, sugar: p.leftover.sugar }) : '';

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
      ? `<span class="bad">${t('input.cash.negAll')}</span>`
      : low < 0
      ? `<span class="bad">${t('input.cash.negNone')}</span>`
      : low === high ? '' : t('input.cash.range');

    const sub = ctx.ownSub;
    $('status').innerHTML = ctx.closed
      ? `<div class="notice">${t('input.closed')}</div>`
      : sub
        ? `<div class="notice">${t('input.submitted', { what: sub.monthlyDecision.watching ? t('input.submitted.watch') : t('input.submitted.sell', { price: yen(sub.monthlyDecision.price) }) })}</div>`
        : '';
    submitBtn.textContent = sub ? t('input.resubmit') : submitLabel;
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
      alert(t('input.submitFailed'));
    } finally {
      if (container.contains(submitBtn)) refresh();
    }
  }

  const WATCHING: MonthlyDecision = { lemonQty: 0, sugarQty: 0, price: 0, watching: true };

  submitBtn.addEventListener('click', () => {
    if (v.price <= 0) {
      // 価格0では売れないので、静観にするか確認する
      if (confirm(t('input.confirmZero'))) send(WATCHING);
      return;
    }
    send(decisionNow());
  });
  watchBtn.addEventListener('click', () => {
    if (confirm(t('input.confirmWatch'))) send(WATCHING);
  });

  refresh();
  return {
    update(next) {
      ctx = next;
      if (container.contains(submitBtn)) refresh();
    },
  };
}
