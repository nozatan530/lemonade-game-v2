// 毎月の入力画面。月が変わるまで作り直さず、入力中の値を保つ。

import { previewDecision } from '../../engine/preview';
import type { MonthlyDecision, TeamState } from '../../engine/types';
import type { Clock, PublicConfig, SubmissionDoc } from '../../sync/schema';
import { esc, yen, signedYen } from '../../ui/format';
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
): InputView {
  let ctx = initial;
  const v = {
    lemon: startValues.decision.watching ? DEFAULT_DECISION.lemonQty : startValues.decision.lemonQty,
    sugar: startValues.decision.watching ? DEFAULT_DECISION.sugarQty : startValues.decision.sugarQty,
    price: startValues.decision.price > 0 ? startValues.decision.price : DEFAULT_DECISION.price,
    maxSell: startValues.decision.maxSell as number | undefined,
    barista: startValues.baristaCount,
  };
  const { prices } = ctx.clock;
  const cap = ctx.pub.baristaCapacity;

  container.innerHTML = `
    ${ctx.clock.message ? `<div class="notice">📰 ${esc(ctx.clock.message)}</div>` : ''}
    <div class="card">
      <h2>今月の値段</h2>
      <div class="chips">
        <span class="chip">🍋 レモン ${yen(prices.lemon)}/個</span>
        <span class="chip">🍬 砂糖 ${yen(prices.sugar)}/袋</span>
        <span class="chip">👩‍🍳 バリスタ ${yen(prices.barista)}/人</span>
      </div>
      <p class="muted" style="margin:8px 0 0">1杯＝レモン${ctx.pub.recipe.lemon}個＋砂糖${ctx.pub.recipe.sugar}袋。バリスタ1人で1か月に${cap}杯まで作れます。</p>
      <p class="muted" id="stock" style="margin:4px 0 0"></p>
    </div>
    <div class="card" id="inputs"><h2>今月の決定</h2></div>
    <div class="card" id="preview"></div>
    <div id="status"></div>
    <button class="btn" id="submit" type="button">提出する</button>
    <button class="btn secondary" id="watch" type="button">今月は静観する（売らない）</button>
  `;
  const inputs = container.querySelector<HTMLElement>('#inputs')!;
  const previewEl = container.querySelector<HTMLElement>('#preview')!;
  const statusEl = container.querySelector<HTMLElement>('#status')!;
  const submitBtn = container.querySelector<HTMLButtonElement>('#submit')!;
  const watchBtn = container.querySelector<HTMLButtonElement>('#watch')!;

  const steppers = [
    stepper({ label: '🍋 レモンを買う', hint: '個', value: v.lemon, step: 10, onChange: (x) => { v.lemon = x; refresh(); } }),
    stepper({ label: '🍬 砂糖を買う', hint: '袋', value: v.sugar, step: 10, onChange: (x) => { v.sugar = x; refresh(); } }),
    stepper({ label: '💰 1杯の値段', hint: '円', value: v.price, step: 10, max: 10000, onChange: (x) => { v.price = x; refresh(); } }),
  ];
  if (ctx.clock.quarterStart) {
    steppers.push(stepper({
      label: '👩‍🍳 バリスタの人数',
      hint: `3か月ごとに決めます。1人${yen(prices.barista)}/月`,
      value: v.barista, step: 1, max: 20,
      onChange: (x) => { v.barista = x; refresh(); },
    }));
  }
  steppers.forEach((s) => inputs.appendChild(s.el));

  // 販売上限（任意）
  const details = document.createElement('details');
  details.innerHTML = `<summary>くわしく：売る数の上限を決める（ふつうは不要）</summary>
    <p class="muted" style="margin:4px 0">上限を決めると、残った材料を来月に回せます。空にすると作れるだけ売ります。</p>
    <div class="stepper"><div class="label">🥤 売る数の上限<small>杯（空＝作れるだけ）</small></div>
      <div class="ctrl"><input type="number" inputmode="numeric" min="0" id="maxsell" placeholder="—"></div></div>`;
  inputs.appendChild(details);
  const maxSellInput = details.querySelector<HTMLInputElement>('#maxsell')!;
  if (v.maxSell !== undefined) { maxSellInput.value = String(v.maxSell); details.open = true; }
  maxSellInput.addEventListener('input', () => {
    v.maxSell = maxSellInput.value === '' ? undefined : Math.max(0, Math.floor(Number(maxSellInput.value)));
    refresh();
  });

  const baristaNow = () => (ctx.clock.quarterStart ? v.barista : ctx.me.baristaCount);
  const decisionNow = (): MonthlyDecision => ({
    lemonQty: v.lemon, sugarQty: v.sugar, price: v.price, ...(v.maxSell !== undefined ? { maxSell: v.maxSell } : {}),
  });

  function refresh() {
    const me = ctx.me;
    container.querySelector('#stock')!.textContent =
      `いまの在庫：🍋${me.stock.lemon}個・🍬${me.stock.sugar}袋　／　バリスタ ${me.baristaCount}人`;

    const b = baristaNow();
    const p = previewDecision(me.stock, decisionNow(), b, prices, ctx.pub);
    const limitText = p.capacity.maxMake === 0
      ? ''
      : p.bottleneck === 'barista' ? `（バリスタ${b}人で${p.capacity.capBarista}杯まで）`
      : p.bottleneck === 'lemon' ? '（レモンが足りない）'
      : p.bottleneck === 'sugar' ? '（砂糖が足りない）' : '（材料もバリスタもぴったり）';
    const warn = b === 0
      ? '<p class="bad">⚠️ バリスタが0人なので作れません。</p>'
      : p.capacity.maxMake === 0 ? '<p class="bad">⚠️ 材料がないので作れません。</p>' : '';

    previewEl.innerHTML = `
      <h2>このまま提出すると…</h2>
      ${warn}
      <table class="pl">
        <tr><td>作れる数</td><td>${p.capacity.maxMake}杯 <span class="muted">${limitText}</span></td></tr>
        <tr><td>お店に出す数</td><td>${p.offered}杯</td></tr>
        <tr><td>かかるお金<span class="explain">材料 ${yen(p.costs.costLemon + p.costs.costSugar)}＋バリスタの給料 ${yen(p.costs.costBarista)}</span></td><td>${yen(p.costs.totalCost)}</td></tr>
        <tr><td>全部売れたら<span class="explain">${p.offered}杯 × ${yen(v.price)}</span></td><td>${yen(p.revenueIfSoldOut)}</td></tr>
        <tr class="total"><td>全部売れたときのもうけ</td><td class="${p.profitIfSoldOut >= 0 ? 'good' : 'bad'}">${signedYen(p.profitIfSoldOut)}</td></tr>
      </table>
      <p class="muted" style="margin:8px 0 0">来月に残る材料：🍋${p.leftover.lemon}個・🍬${p.leftover.sugar}袋。売れ残った分は捨てることになります。</p>
      <p class="muted" style="margin:4px 0 0">お客さんは安いお店から順に買います。高すぎると売れ残るかも。</p>`;

    const sub = ctx.ownSub;
    statusEl.innerHTML = ctx.closed
      ? '<div class="notice">⏰ 締め切りました。結果を待っています…</div>'
      : sub
        ? `<div class="notice">✅ 提出しました（${sub.monthlyDecision.watching ? '静観' : `${yen(sub.monthlyDecision.price)}で販売`}）。締切までは出し直せます。</div>`
        : '';
    submitBtn.textContent = sub ? '出し直す' : '提出する';
    submitBtn.disabled = ctx.closed;
    watchBtn.disabled = ctx.closed;
    steppers.forEach((s) => s.setDisabled(ctx.closed));
    maxSellInput.disabled = ctx.closed;
  }

  async function send(decision: MonthlyDecision) {
    submitBtn.disabled = watchBtn.disabled = true;
    try {
      await onSubmit(decision, ctx.clock.quarterStart ? v.barista : undefined);
    } catch {
      alert('提出できませんでした。締切を過ぎたか、通信がとぎれた可能性があります。');
    } finally {
      refresh();
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
      refresh();
    },
  };
}
