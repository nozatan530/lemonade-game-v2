// データの変化を受け取る。戻り値の関数を呼ぶと受け取りをやめる。

import { onValue, ref, type Database } from 'firebase/database';
import type { MonthResult, TeamState } from '../engine/types';
import { asArray, asRecord } from './codec';
import { gamePath } from './game';
import { monthKey, type Clock, type GameMeta, type PublicConfig, type SubmissionDoc, type TeamSlot } from './schema';

type Unsubscribe = () => void;

function watchPath<T>(db: Database, path: string, cb: (value: T | null) => void): Unsubscribe {
  return onValue(ref(db, path), (snap) => cb(snap.exists() ? (snap.val() as T) : null));
}

export const watchMeta = (db: Database, code: string, cb: (v: GameMeta | null) => void) =>
  watchPath(db, gamePath(code, 'meta'), cb);

export const watchPublic = (db: Database, code: string, cb: (v: PublicConfig | null) => void) =>
  watchPath(db, gamePath(code, 'public'), cb);

export const watchClock = (db: Database, code: string, cb: (v: Clock | null) => void) =>
  watchPath(db, gamePath(code, 'clock'), cb);

export const watchTeams = (db: Database, code: string, cb: (v: Record<string, TeamSlot>) => void) =>
  watchPath<Record<string, TeamSlot>>(db, gamePath(code, 'teams'), (v) => cb(asRecord(v)));

export const watchState = (db: Database, code: string, cb: (v: Record<string, TeamState>) => void) =>
  watchPath<Record<string, TeamState>>(db, gamePath(code, 'state'), (v) => cb(asRecord(v)));

// 提出済みのチーム（中身は含まない）
export const watchSubmitted = (db: Database, code: string, month: number, cb: (v: Record<string, true>) => void) =>
  watchPath<Record<string, true>>(db, gamePath(code, `submitted/${monthKey(month)}`), (v) => cb(asRecord(v)));

// 自分のチームの提出（出し直しや、画面の読み込み直しのとき用）
export const watchOwnSubmission = (
  db: Database, code: string, month: number, teamId: string, cb: (v: SubmissionDoc | null) => void,
) => watchPath(db, gamePath(code, `subs/${monthKey(month)}/${teamId}`), cb);

export const watchResults = (db: Database, code: string, cb: (v: MonthResult[]) => void) =>
  watchPath<Record<string, MonthResult>>(db, gamePath(code, 'results'), (v) => {
    const all = asRecord<MonthResult>(v);
    cb(Object.keys(all).sort().map((k) => ({ ...all[k]!, teamResults: asArray(all[k]!.teamResults) })));
  });

// サーバー時刻とのずれ（ミリ秒）。締切の表示と判定に使う
export function watchServerOffset(db: Database, cb: (offsetMs: number) => void): Unsubscribe {
  return watchPath<number>(db, '.info/serverTimeOffset', (v) => cb(v ?? 0));
}

// その月の市場予算（GM だけが読める）
export const watchHidden = (db: Database, code: string, month: number, cb: (v: { marketBudget: number } | null) => void) =>
  watchPath(db, gamePath(code, `hidden/${monthKey(month)}`), cb);

// GM が作ったゲームの一覧（コード → 作成時刻）
export const watchMyGames = (db: Database, gmUid: string, cb: (v: Record<string, number>) => void) =>
  watchPath<Record<string, number>>(db, `gmGames/${gmUid}`, (v) => cb(asRecord(v)));
