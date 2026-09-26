// ゲームの読み書き。計算は engine に任せ、ここではデータベースとのやりとりだけを行う。

import {
  get, ref, remove, serverTimestamp, set, update, type Database,
} from 'firebase/database';
import { canChangeBarista, inputSecondsFor, withTeamCount } from '../engine/config';
import { closeMonth, openNextMonth, startTerm } from '../engine/month';
import type {
  GameConfig, MonthConditions, MonthlyDecision, MonthResult, QuarterlyDecision, Submission, TeamState, TimerSettings,
} from '../engine/types';
import { asArray, asRecord, stripUndefined } from './codec';
import { monthKey, publicConfigOf, type Clock, type GameMeta, type SubmissionDoc, type TeamSlot } from './schema';

// ゲームコード：読み間違えやすい文字（0/O, 1/I/L）を除いた6文字
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function generateGameCode(random: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return s;
}

export function teamIdOf(index: number): string {
  return `t${String(index + 1).padStart(2, '0')}`;
}

const gamePath = (code: string, sub = '') => `games/${code}${sub ? '/' + sub : ''}`;

async function read<T>(db: Database, path: string): Promise<T | null> {
  const snap = await get(ref(db, path));
  return snap.exists() ? (snap.val() as T) : null;
}

// チームを表示順に並べる
export function sortedTeams(teams: Record<string, TeamSlot>): { teamId: string; slot: TeamSlot }[] {
  return Object.entries(teams)
    .map(([teamId, slot]) => ({ teamId, slot }))
    .sort((a, b) => a.slot.order - b.slot.order);
}

// ---- GM ----

export async function createGame(
  db: Database,
  gmUid: string,
  input: { config: GameConfig; teamNames: string[]; timer: TimerSettings; now: number },
): Promise<string> {
  let code = '';
  // 同じコードのゲームがあれば作り直す（meta は上書きできないルール）
  for (let attempt = 0; ; attempt++) {
    code = generateGameCode();
    if (!(await read(db, gamePath(code, 'meta')))) {
      const meta: GameMeta = { gmUid, createdAt: input.now, status: 'active' };
      try {
        await set(ref(db, gamePath(code, 'meta')), meta);
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
      }
    }
    if (attempt >= 4) throw new Error('ゲームコードを作れませんでした');
  }

  const lobby: Clock = {
    month: 0, monthKey: monthKey(0), phase: 'lobby', deadlineAt: 0, quarterStart: false,
    prices: input.config.initialPrices,
  };
  const updates: Record<string, unknown> = {
    config: input.config,
    public: publicConfigOf(input.config),
    settings: { timer: input.timer },
    clock: lobby,
  };
  input.teamNames.forEach((name, i) => {
    updates[`teams/${teamIdOf(i)}/name`] = name;
    updates[`teams/${teamIdOf(i)}/order`] = i;
  });
  await update(ref(db, gamePath(code)), stripUndefined(updates));
  await set(ref(db, `gmGames/${gmUid}/${code}`), input.now);
  return code;
}

export async function releaseTeam(db: Database, code: string, teamId: string): Promise<void> {
  await remove(ref(db, gamePath(code, `teams/${teamId}/uid`)));
}

function clockFor(conditions: MonthConditions, timer: TimerSettings, now: number, config: GameConfig): Clock {
  return stripUndefined({
    month: conditions.month,
    monthKey: monthKey(conditions.month),
    phase: 'input',
    deadlineAt: now + inputSecondsFor(conditions.month, timer) * 1000,
    quarterStart: canChangeBarista(conditions.month, config.baristaCadence),
    prices: conditions.prices,
    message: conditions.message,
  });
}

// 1か月目を始める。dropUnjoined なら、参加していないチームを外してから始める
export async function startGame(
  db: Database, code: string, now: number, options: { dropUnjoined?: boolean } = {},
): Promise<void> {
  const [config, settings, teams, clock] = await Promise.all([
    read<GameConfig>(db, gamePath(code, 'config')),
    read<{ timer: TimerSettings }>(db, gamePath(code, 'settings')),
    read<Record<string, TeamSlot>>(db, gamePath(code, 'teams')),
    read<Clock>(db, gamePath(code, 'clock')),
  ]);
  if (!config || !settings || !teams || !clock) throw new Error('ゲームが見つかりません');
  if (clock.phase !== 'lobby') return;

  const all = sortedTeams(teams);
  const kept = options.dropUnjoined ? all.filter(({ slot }) => slot.uid) : all;
  if (kept.length === 0) throw new Error('参加しているチームがありません');
  const removed: Record<string, null> = {};
  for (const { teamId } of all.filter((t) => !kept.includes(t))) {
    removed[`teams/${teamId}/name`] = null;
    removed[`teams/${teamId}/order`] = null;
    removed[`teams/${teamId}/uid`] = null;
  }
  const finalConfig = kept.length === all.length ? config : withTeamCount(config, all.length, kept.length);

  const list = kept.map(({ teamId, slot }) => ({ teamId, name: slot.name }));
  const term = startTerm(finalConfig, list);
  const state: Record<string, TeamState> = {};
  for (const t of term.teams) state[t.teamId] = t;

  await update(ref(db, gamePath(code)), {
    ...removed,
    ...(finalConfig !== config ? { config: finalConfig } : {}),
    state,
    [`hidden/${monthKey(1)}`]: { marketBudget: term.conditions.marketBudget },
    clock: clockFor(term.conditions, settings.timer, now, finalConfig),
  });
}

// 締切の処理。すでに締め切られていたら何もしない（'already' を返す）
export async function closeCurrentMonth(db: Database, code: string): Promise<'closed' | 'already'> {
  const clock = await read<Clock>(db, gamePath(code, 'clock'));
  if (!clock || clock.phase !== 'input') return 'already';
  const m = clock.month;
  const mk = monthKey(m);

  const [config, teams, state, hidden, subs, prevDecided] = await Promise.all([
    read<GameConfig>(db, gamePath(code, 'config')),
    read<Record<string, TeamSlot>>(db, gamePath(code, 'teams')),
    read<Record<string, TeamState>>(db, gamePath(code, 'state')),
    read<{ marketBudget: number }>(db, gamePath(code, `hidden/${mk}`)),
    read<Record<string, SubmissionDoc>>(db, gamePath(code, `subs/${mk}`)),
    read<Record<string, MonthlyDecision>>(db, gamePath(code, `decided/${monthKey(m - 1)}`)),
  ]);
  if (!config || !teams || !state || !hidden) throw new Error('ゲームのデータが足りません');

  const teamStates = sortedTeams(teams).map(({ teamId }) => {
    const s = state[teamId];
    if (!s) throw new Error(`${teamId} の状態がありません`);
    return s;
  });
  const submissions: Submission[] = Object.entries(asRecord<SubmissionDoc>(subs)).map(([teamId, doc]) => ({
    teamId,
    monthlyDecision: doc.monthlyDecision,
    ...(doc.quarterlyDecision ? { quarterlyDecision: doc.quarterlyDecision } : {}),
    order: doc.submittedAt,
  }));
  const conditions: MonthConditions = stripUndefined({
    month: m, marketBudget: hidden.marketBudget, prices: clock.prices, message: clock.message,
  });

  const r = closeMonth(config, teamStates, conditions, submissions, asRecord(prevDecided));
  const newState: Record<string, TeamState> = {};
  for (const t of r.teams) newState[t.teamId] = t;

  try {
    // 結果・月末の状態・進行の状態を1回でまとめて書く（results は一度しか書けないルール）
    await update(ref(db, gamePath(code)), stripUndefined({
      [`results/${mk}`]: r.result,
      state: newState,
      [`decided/${mk}`]: r.decided,
      'clock/phase': 'result',
    }));
  } catch (e) {
    const already = await read(db, gamePath(code, `results/${mk}`));
    if (already) return 'already';
    throw e;
  }
  return 'closed';
}

// 次の月を始める。最終月の後なら期末（final）にする
export async function startNextMonth(db: Database, code: string, now: number): Promise<'started' | 'final' | 'noop'> {
  const [clock, config, settings, teams] = await Promise.all([
    read<Clock>(db, gamePath(code, 'clock')),
    read<GameConfig>(db, gamePath(code, 'config')),
    read<{ timer: TimerSettings }>(db, gamePath(code, 'settings')),
    read<Record<string, TeamSlot>>(db, gamePath(code, 'teams')),
  ]);
  if (!clock || !config || !settings || !teams) throw new Error('ゲームが見つかりません');
  if (clock.phase !== 'result') return 'noop';

  const result = await read<MonthResult>(db, gamePath(code, `results/${clock.monthKey}`));
  // その月に実際に使った単価を引き継ぐ（GM が上書きしていればその値）
  const usedPrices = result?.prices ?? clock.prices;
  const next = openNextMonth(config, clock.month, Object.keys(teams).length, usedPrices);
  if (!next) {
    await update(ref(db, gamePath(code)), { 'clock/phase': 'final', 'meta/status': 'ended' });
    return 'final';
  }
  await update(ref(db, gamePath(code)), {
    [`hidden/${monthKey(next.month)}`]: { marketBudget: next.marketBudget },
    clock: clockFor(next, settings.timer, now, config),
  });
  return 'started';
}

export async function extendDeadline(db: Database, code: string, seconds: number): Promise<void> {
  const clock = await read<Clock>(db, gamePath(code, 'clock'));
  if (!clock || clock.phase !== 'input') return;
  await set(ref(db, gamePath(code, 'clock/deadlineAt')), clock.deadlineAt + seconds * 1000);
}

export async function deleteGame(db: Database, code: string, gmUid: string): Promise<void> {
  await remove(ref(db, gamePath(code)));
  await remove(ref(db, `gmGames/${gmUid}/${code}`));
}

// 作成から days 日以上たった自分のゲームを削除する（新しいゲームを作るときに呼ぶ）
export async function cleanupOldGames(db: Database, gmUid: string, now: number, days = 30): Promise<string[]> {
  const mine = asRecord<number>(await read(db, `gmGames/${gmUid}`));
  const limit = now - days * 24 * 60 * 60 * 1000;
  const old = Object.entries(mine).filter(([, createdAt]) => createdAt < limit).map(([code]) => code);
  for (const code of old) {
    const meta = await read<GameMeta>(db, gamePath(code, 'meta'));
    if (meta && meta.gmUid === gmUid) await remove(ref(db, gamePath(code)));
    await remove(ref(db, `gmGames/${gmUid}/${code}`));
  }
  return old;
}

// 締切の猶予（ミリ秒）。ルールは締切＋3秒まで提出を受け付けるので、それより後に締め切る
export const CLOSE_GRACE_MS = 3500;

// 自動で締め切るべきか。締切を過ぎたか、参加しているチームが全員提出したとき
export function shouldAutoClose(
  clock: Clock,
  serverNow: number,
  joinedTeamIds: string[],
  submittedTeamIds: string[],
  closeWhenAllSubmitted: boolean,
): boolean {
  if (clock.phase !== 'input') return false;
  if (serverNow >= clock.deadlineAt + CLOSE_GRACE_MS) return true;
  if (!closeWhenAllSubmitted || joinedTeamIds.length === 0) return false;
  const submitted = new Set(submittedTeamIds);
  return joinedTeamIds.every((id) => submitted.has(id));
}

// ---- 販売チーム ----

// チームの枠を確保する。すでに別の端末が使っていれば失敗する
export async function claimTeam(db: Database, code: string, teamId: string, uid: string): Promise<void> {
  await set(ref(db, gamePath(code, `teams/${teamId}/uid`)), uid);
}

export async function submitDecision(
  db: Database,
  code: string,
  month: number,
  teamId: string,
  monthlyDecision: MonthlyDecision,
  quarterlyDecision?: QuarterlyDecision,
): Promise<void> {
  const mk = monthKey(month);
  await update(ref(db, gamePath(code)), {
    [`subs/${mk}/${teamId}`]: stripUndefined({ monthlyDecision, quarterlyDecision, submittedAt: serverTimestamp() }),
    [`submitted/${mk}/${teamId}`]: true,
  });
}

// ---- 読み込み（画面の初期表示などで一度だけ読む） ----

export async function readResults(db: Database, code: string): Promise<MonthResult[]> {
  const all = asRecord<MonthResult>(await read(db, gamePath(code, 'results')));
  return Object.keys(all).sort().map((k) => {
    const r = all[k]!;
    return { ...r, teamResults: asArray(r.teamResults) };
  });
}

export { read as readPath, gamePath };
