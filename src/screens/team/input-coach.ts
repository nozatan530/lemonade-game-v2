// 最初の1回だけ、1か月目の入力画面で手順を順に案内する（ソロ・チーム画面で共通）。
// 一度見たら（またはスキップしたら）ブラウザに記録して、次からは出さない。

import { t } from '../../i18n';
import { startCoach, type CoachStep } from '../../ui/coach';

const KEY = 'lemonade-input-coach-v1';

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === 'done';
  } catch {
    return true; // 保存できない環境では、毎回出すと邪魔なので出さない
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(KEY, 'done');
  } catch {
    // 何もしない
  }
}

export function resetInputCoach(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}

// 入力画面（mountInputView の中身）が表示されたあとに呼ぶ
export function maybeStartInputCoach(container: HTMLElement, submitLabel: string): void {
  if (seen()) return;
  const q = (sel: string) => container.querySelector<HTMLElement>(sel);
  const steps: CoachStep[] = [
    { target: q('#buy')?.closest('.card') ?? null, title: t('coach.buy.title'), text: t('coach.buy.text') },
    { target: q('[data-field="barista"]') ?? q('#baristaFixed'), title: t('coach.barista.title'), text: t('coach.barista.text') },
    { target: q('#sell')?.closest('.card') ?? null, title: t('coach.sell.title'), text: t('coach.sell.text') },
    { target: q('.cashbar'), title: t('coach.cash.title'), text: t('coach.cash.text', { submit: submitLabel }) },
  ].filter((s): s is CoachStep => s.target !== null);
  startCoach(steps, markSeen);
}
