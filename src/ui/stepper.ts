// ＋／− ボタン付きの数値入力（スマホで押しやすい大きさ）

import { esc } from './format';

export interface StepperOptions {
  field?: string; // 画面の中での名前（言語に関係なく要素を探すため。data-field に入る）
  label: string;
  hint?: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}

export interface Stepper {
  el: HTMLElement;
  set: (v: number) => void;
  setDisabled: (d: boolean) => void;
  setHint: (html: string) => void; // 説明の行を書き換える（呼ぶ側でエスケープすること）
}

export function stepper(opts: StepperOptions): Stepper {
  const min = opts.min ?? 0;
  const max = opts.max ?? 100000;
  const el = document.createElement('div');
  el.className = 'stepper';
  if (opts.field) el.dataset.field = opts.field;
  el.innerHTML = `
    <div class="label">${esc(opts.label)}<small class="hint">${opts.hint ? esc(opts.hint) : ''}</small></div>
    <div class="ctrl">
      <button type="button" aria-label="${esc(opts.label)}を減らす">−</button>
      <input type="number" inputmode="numeric" min="${min}" max="${max}" step="${opts.step}" aria-label="${esc(opts.label)}">
      <button type="button" aria-label="${esc(opts.label)}を増やす">＋</button>
    </div>`;
  const [minus, plus] = el.querySelectorAll('button');
  const input = el.querySelector('input')!;
  let value = opts.value;

  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? Math.floor(v) : min));
  const set = (v: number, notify = false) => {
    value = clamp(v);
    input.value = String(value);
    if (notify) opts.onChange(value);
  };
  set(value);

  minus!.addEventListener('click', () => set(value - opts.step, true));
  plus!.addEventListener('click', () => set(value + opts.step, true));
  input.addEventListener('input', () => {
    if (input.value === '') return; // 打ち直しの途中
    value = clamp(Number(input.value));
    opts.onChange(value);
  });
  input.addEventListener('change', () => set(Number(input.value), true));
  input.addEventListener('focus', () => input.select());

  return {
    el,
    set: (v) => set(v),
    setDisabled: (d) => el.querySelectorAll('button, input').forEach((x) => ((x as HTMLButtonElement).disabled = d)),
    setHint: (html) => { el.querySelector('.hint')!.innerHTML = html; },
  };
}
