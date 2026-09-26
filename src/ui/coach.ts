// 画面の一部を順に光らせて説明する案内（コーチマーク）。
// 背景を暗くし、説明している場所だけを前に出して枠で囲む。「次へ」「スキップ」で進める。

import { t } from '../i18n';
import { esc } from './format';

export interface CoachStep {
  target: HTMLElement;
  title: string;
  text: string;
}

export function startCoach(steps: CoachStep[], onFinish: () => void): void {
  if (steps.length === 0) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'coach-backdrop';
  const bubble = document.createElement('div');
  bubble.className = 'coach-bubble';
  bubble.setAttribute('role', 'dialog');
  bubble.setAttribute('aria-live', 'polite');
  document.body.append(backdrop, bubble);

  let i = 0;
  let current: HTMLElement | null = null;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    clearInterval(watch);
    window.removeEventListener('hashchange', finish);
    current?.classList.remove('coach-target');
    backdrop.remove();
    bubble.remove();
    onFinish();
  };
  // 画面が切り替わった（締切で結果に進んだ、別のページへ移った）ら、案内を閉じる
  const watch = setInterval(() => { if (current && !current.isConnected) finish(); }, 400);
  window.addEventListener('hashchange', finish);

  const show = () => {
    const step = steps[i]!;
    current?.classList.remove('coach-target');
    current = step.target;
    current.classList.add('coach-target');
    current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // 説明は、光らせている場所と重ならない側に出す
    const isFixedBottom = getComputedStyle(current).position === 'fixed';
    bubble.classList.toggle('top', isFixedBottom);
    bubble.innerHTML = `
      <div class="coach-count">${i + 1} / ${steps.length}</div>
      <h3>${esc(step.title)}</h3>
      <p>${esc(step.text)}</p>
      <div class="coach-buttons">
        <button type="button" class="small" data-act="skip">${t('coach.skip')}</button>
        <button type="button" class="btn" data-act="next">${i === steps.length - 1 ? t('coach.start') : t('coach.next')}</button>
      </div>`;
    bubble.querySelector<HTMLButtonElement>('[data-act="next"]')!.focus();
  };

  bubble.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest('button')?.dataset.act;
    if (act === 'skip') finish();
    if (act === 'next') {
      i++;
      if (i >= steps.length) finish();
      else show();
    }
  });
  show();
}
