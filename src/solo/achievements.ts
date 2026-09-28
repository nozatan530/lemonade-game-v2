// 肩書きコレクション：ソロモードでもらった肩書きを、このブラウザにだけ保存する（個人情報はふくまない）。
// 同じゲームの同じ年を2回数えないよう、記録した年も覚えておく。

import { TITLE_IDS, type TitleId } from '../engine/titles';

const STORAGE_KEY = 'lemonade-titles-v1';
const MAX_RECORDED = 300;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface TitleRecord {
  count: number; // もらった回数
  first: string; // はじめてもらった日（YYYY-MM-DD）
}

export interface Achievements {
  version: 1;
  titles: Partial<Record<TitleId, TitleRecord>>;
  recorded: string[]; // 記録ずみの「ゲーム:年」
}

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const empty = (): Achievements => ({ version: 1, titles: {}, recorded: [] });

export function loadAchievements(storage: KeyValueStorage | null = defaultStorage()): Achievements {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return empty();
    const a = JSON.parse(raw) as Achievements;
    if (a.version !== 1 || typeof a.titles !== 'object' || !Array.isArray(a.recorded)) return empty();
    // 知らない肩書き（将来の版で消えたものなど）は無視する
    const titles: Achievements['titles'] = {};
    for (const id of TITLE_IDS) if (a.titles[id]) titles[id] = a.titles[id];
    return { version: 1, titles, recorded: a.recorded };
  } catch {
    return empty();
  }
}

// ある年の肩書きを記録する。はじめてもらった肩書きを返す（記録ずみの年なら何もしない）
export function recordYearTitles(
  gameKey: string,
  year: number,
  ids: TitleId[],
  storage: KeyValueStorage | null = defaultStorage(),
  today = new Date().toISOString().slice(0, 10),
): TitleId[] {
  const a = loadAchievements(storage);
  const key = `${gameKey}:${year}`;
  if (a.recorded.includes(key)) return [];
  const unlocked: TitleId[] = [];
  for (const id of ids) {
    const r = a.titles[id];
    if (r) r.count++;
    else {
      a.titles[id] = { count: 1, first: today };
      unlocked.push(id);
    }
  }
  a.recorded = [...a.recorded, key].slice(-MAX_RECORDED);
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(a));
  } catch {
    // 保存できなくても遊べる
  }
  return unlocked;
}
