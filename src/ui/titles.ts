// 肩書きの表示（名前・説明・小さな札）。どの肩書きがつくかは engine の titles.ts が決める。

import { TITLE_EMOJI, type TitleId } from '../engine/titles';
import { t, type Key } from '../i18n';
import { esc } from './format';

export const titleName = (id: TitleId) => t(`title.${id}.name` as Key);
export const titleDesc = (id: TitleId) => t(`title.${id}.desc` as Key);

// 「👑 市場の覇者」の札。cls で見た目を変える（画面用：title-chip、紙用：s-chip）
export function titleChip(id: TitleId, cls = 'title-chip', extra = ''): string {
  return `<span class="${cls}${id === 'apprentice' ? ' plain' : ''}">${TITLE_EMOJI[id]} ${esc(titleName(id))}${extra}</span>`;
}
