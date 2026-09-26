// 最初の1回だけ、1か月目の入力画面で手順を順に案内する（ソロ・チーム画面で共通）。
// 一度見たら（またはスキップしたら）ブラウザに記録して、次からは出さない。

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
    {
      target: q('#buy')?.closest('.card') ?? null,
      title: '① 仕入れる',
      text: 'レモンと砂糖を何個買うか決めます。1杯＝レモン1個＋砂糖1袋。「＋」「−」で数を変えると、使うお金がすぐ計算されます。',
    },
    {
      target: q('input[aria-label="👩‍🍳 バリスタ"]')?.closest('.stepper') ?? q('#baristaFixed'),
      title: '👩‍🍳 バリスタ',
      text: 'レモネードを作る人です。1人で1か月に50杯まで作れます。給料は、売れても売れなくても毎月かかります。',
    },
    {
      target: q('#sell')?.closest('.card') ?? null,
      title: '② 値段を決める',
      text: 'お客さんは安いお店から順に買います。「1杯あたりの原価」より高くしないと、売るほど損します。「元がとれる数」も見てみよう。',
    },
    {
      target: q('.cashbar'),
      title: '③ 月末のお金を確かめる',
      text: `売れた数しだいで、月末のお金は「1杯も売れなかったら〜全部売れたら」の間になります。決めたら「${submitLabel}」を押そう。`,
    },
  ].filter((s): s is CoachStep => s.target !== null);
  startCoach(steps, markSeen);
}
