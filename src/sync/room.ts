// ルームモード：だれでもルームを作り、最大4人で遊ぶ。空いた席はロボット店長が入る。
// GM はいない。進行（締切・集計・次の月）は、参加している端末のどれかが自動で行う。
// 計算は engine に任せる（ロボットは engine/robots.ts。ソロと同じ）。ここはデータベースとのやりとりだけ。
//
// 進行のきまり
// - 全員（人）が提出したら5秒後、または締切（1か月目150秒・そのほか100秒）を過ぎたら、集計する
// - 集計は1台だけが行う（clock をトランザクションで closing にできた端末）。結果は1度しか書けない
// - 結果のあと、全員が「次の月へ」を押すか、30秒たったら次の月へ

import { get, onDisconnect, onValue, ref, runTransaction, serverTimestamp, set, update, type Database } from 'firebase/database';
import { canChangeBarista, DEFAULT_TIMER, inputSecondsFor, withMarketPattern, withRandomMarketSize, defaultConfig } from '../engine/config';
import { monthConditions } from '../engine/demand';
import { closeMonth, openNextMonth, startTerm } from '../engine/month';
import { assignCpuTypes, robotSubmissions, shuffleOrder } from '../engine/robots';
import type {
  CpuType, GameConfig, MarketPattern, MonthConditions, MonthlyDecision, MonthResult, QuarterlyDecision, Submission,
  TeamState,
} from '../engine/types';
import { SOLO_DIFFICULTY, type SoloDifficulty } from '../solo/local-game';
import { asRecord, stripUndefined } from './codec';
import { generateGameCode } from './game';
import { monthKey, publicConfigOf, type Clock, type SubmissionDoc, type TeamSlot } from './schema';

export const ROOM_SEATS = ['t01', 't02', 't03', 't04'] as const;
export const ROOM_NAMES = ['🐊 Alligator', '🐻 Bear', '🐱 Cat', '🐶 Dog'];
export const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // 6時間たったルームは、だれでも消せる（新しいルームを作るときの掃除）
export const MAX_ROOMS = 20; // 同時に開けるルームの数（4人×20＝80接続。Spark の100接続に収める）
// 最後の人が押してから次の画面までの間（だれが最後に押したか分かりにくくする）
export const RESULT_DELAY_MS = 2500; // 全員が提出してから結果を出すまで
export const NEXT_DELAY_MS = 2500; // 全員が「次の月へ」を押してから次の月へ進むまで
export const NEXT_AUTO_MS = 30000; // 結果のあと、自動で次の月へ進むまで
export const START_ANYONE_MS = 5 * 60 * 1000; // 作った人が始めないとき、ほかの人も「はじめる」を押せるまで
export const CLOSING_RETRY_MS = 10000; // 集計中の端末が落ちたとき、ほかの端末がやり直すまで
const AUTO_PILOT: CpuType = 'follower'; // つながっていない人の代わりに決めるロボットの作戦（ほどほどの値段で、売れる数を見込む）

export interface RoomMeta {
  ownerUid: string;
  createdAt: number;
  status: 'open' | 'playing' | 'ended';
  difficulty: SoloDifficulty;
}

export interface RoomSeat extends TeamSlot {
  robot?: CpuType; // ロボット店長の作戦（はじめるときに空いた席に入る）
  online?: boolean; // 座っている人がいまつながっているか（切れると false。ほかの人が入り直せる）
}

export interface RoomClock extends Clock {
  resultAt?: number; // 結果を出した時刻
  closingAt?: number; // 集計を始めた時刻
  endedEarlyBy?: string; // 途中で終えたときの、終えた人のお店の名前
}

export const roomPath = (code: string, sub = '') => `rooms/${code}${sub ? '/' + sub : ''}`;

async function read<T>(db: Database, path: string): Promise<T | null> {
  const snap = await get(ref(db, path));
  return snap.exists() ? (snap.val() as T) : null;
}

// 席を表示順に。ロボットの席は名前に 🤖 をつける
export function roomTeams(seats: Record<string, RoomSeat>): Record<string, TeamSlot> {
  return Object.fromEntries(Object.entries(seats).map(([id, s]) => [id, {
    name: s.robot ? `🤖 ${s.name}` : s.name, order: s.order, ...(s.uid ? { uid: s.uid } : {}),
  }]));
}

const humanSeats = (seats: Record<string, RoomSeat>) => Object.keys(seats).filter((id) => seats[id]!.uid);

// ---- 作成・参加 ----

// 古いルームの掃除と、混み具合の確認。開いているルームが多すぎるときは 'busy'
export async function cleanupRooms(db: Database, now: number): Promise<'ok' | 'busy'> {
  const index = asRecord<number>(await read(db, 'roomIndex'));
  let active = 0;
  for (const [code, createdAt] of Object.entries(index)) {
    if (createdAt < now - ROOM_TTL_MS) {
      await set(ref(db, roomPath(code)), null).catch(() => {});
      await set(ref(db, `roomIndex/${code}`), null).catch(() => {});
    } else active++;
  }
  return active >= MAX_ROOMS ? 'busy' : 'ok';
}

export async function createRoom(
  db: Database, uid: string, input: { difficulty: SoloDifficulty; pattern: MarketPattern; now: number },
): Promise<string> {
  const seed = `room-${input.now}-${Math.floor(Math.random() * 1e6)}`;
  const n = ROOM_SEATS.length;
  const config: GameConfig = withMarketPattern(
    withRandomMarketSize(defaultConfig(n, seed), n, SOLO_DIFFICULTY[input.difficulty].market),
    input.pattern,
  );
  config.baristaCadence = 'monthly'; // ソロと同じ
  config.market = { ...config.market, level: input.difficulty };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateGameCode();
    if (await read(db, `roomIndex/${code}`)) continue;
    const lobby: RoomClock = {
      month: 0, monthKey: monthKey(0), phase: 'lobby', deadlineAt: 0, quarterStart: false, prices: config.initialPrices,
    };
    const seats: Record<string, RoomSeat> = {};
    ROOM_SEATS.forEach((id, i) => { seats[id] = { name: ROOM_NAMES[i]!, order: i, ...(i === 0 ? { uid } : {}) }; });
    const meta: RoomMeta = { ownerUid: uid, createdAt: input.now, status: 'open', difficulty: input.difficulty };
    await update(ref(db), stripUndefined({
      [roomPath(code, 'meta')]: meta,
      [roomPath(code, 'config')]: config,
      [roomPath(code, 'public')]: publicConfigOf(config),
      [roomPath(code, 'clock')]: lobby,
      [roomPath(code, 'seats')]: seats,
      [roomPath(code, `members/${uid}`)]: 't01',
      [`roomOwners/${uid}`]: code,
      [`roomIndex/${code}`]: serverTimestamp(),
    }));
    return code;
  }
  throw new Error('ルームコードを作れませんでした');
}

// 空いている席に座る。すでに座っていればその席を返す
export async function joinRoom(db: Database, code: string, uid: string): Promise<string> {
  const mine = await read<string>(db, roomPath(code, `members/${uid}`));
  if (mine) return mine;
  const seats = asRecord<RoomSeat>(await read(db, roomPath(code, 'seats')));
  for (const id of ROOM_SEATS) {
    const s = seats[id];
    if (!s || s.uid || s.robot) continue;
    try {
      await update(ref(db), { [roomPath(code, `seats/${id}/uid`)]: uid, [roomPath(code, `members/${uid}`)]: id });
      return id;
    } catch {
      // ほかの人が先に座った。次の席へ
    }
  }
  throw new Error('満席です');
}

// いまつながっていることを記録する。切れたら自動で false（onDisconnect）
export async function goOnline(db: Database, code: string, teamId: string): Promise<void> {
  const r = ref(db, roomPath(code, `seats/${teamId}/online`));
  await onDisconnect(r).set(false);
  await set(r, true);
}

// つながっている間ずっと「つながっている」を保つ。電波が切れて戻ったとき（スマホのスリープなど）も
// .info/connected を見て記録し直す。返り値で見るのをやめる
export function keepOnline(db: Database, code: string, teamId: string): () => void {
  return onValue(ref(db, '.info/connected'), (snap) => {
    if (snap.val() === true) goOnline(db, code, teamId).catch(() => {});
  });
}

// 入り直せる席：人が座っていたが、いまつながっていない席
export function vacantSeats(seats: Record<string, RoomSeat>): string[] {
  return ROOM_SEATS.filter((id) => seats[id]?.uid && !seats[id]?.robot && seats[id]?.online !== true);
}

// つながっていない人の席を引き継ぐ（途中から入り直す）。お金や材料はその席のまま続く
export async function takeOverSeat(db: Database, code: string, uid: string, teamId: string): Promise<void> {
  await update(ref(db), { [roomPath(code, `seats/${teamId}/uid`)]: uid, [roomPath(code, `members/${uid}`)]: teamId });
  await goOnline(db, code, teamId);
}

// いまつながっている人の席（全員の提出・「次の月へ」を待つのはこの席だけ）
export function onlineHumans(seats: Record<string, RoomSeat>): string[] {
  return ROOM_SEATS.filter((id) => seats[id]?.uid && !seats[id]?.robot && seats[id]?.online === true);
}

// ゲームを途中で終える。そこまでの月の結果で期末にする
export async function endRoom(db: Database, code: string, byName: string): Promise<'final' | 'skip'> {
  const tx = await runTransaction(ref(db, roomPath(code, 'clock')), (c: RoomClock | null) => {
    if (!c) return c;
    if (c.phase === 'final' || c.phase === 'lobby') return undefined;
    return { ...c, phase: 'final', endedEarlyBy: byName };
  });
  if (!tx.committed) return 'skip';
  await set(ref(db, roomPath(code, 'meta/status')), 'ended');
  return 'final';
}

// ---- 進行 ----

// はじめる。空いた席にロボット店長を入れて、1か月目へ
export async function startRoom(db: Database, code: string, now: number): Promise<void> {
  const [config, seats, meta] = await Promise.all([
    read<GameConfig>(db, roomPath(code, 'config')),
    read<Record<string, RoomSeat>>(db, roomPath(code, 'seats')),
    read<RoomMeta>(db, roomPath(code, 'meta')),
  ]);
  if (!config || !seats || !meta) throw new Error('ルームが見つかりません');
  const empty = ROOM_SEATS.filter((id) => !seats[id]?.uid);
  const cpu = assignCpuTypes(config.market.seed, empty, meta.difficulty !== 'easy');
  const term = startTerm(config, ROOM_SEATS.map((id) => ({ teamId: id, name: seats[id]!.name })));
  const state: Record<string, TeamState> = {};
  for (const t of term.teams) state[t.teamId] = t;

  const ok = await runTransaction(ref(db, roomPath(code, 'clock')), (c: RoomClock | null) => {
    if (!c) return c; // まだ読みこめていない（サーバーの値でやり直す）
    if (c.phase !== 'lobby') return undefined; // だれかが先に始めた
    return clockFor(term.conditions, now, config);
  });
  if (!ok.committed) return;
  const updates: Record<string, unknown> = { [roomPath(code, 'state')]: state, [roomPath(code, 'meta/status')]: 'playing' };
  for (const id of empty) updates[roomPath(code, `seats/${id}/robot`)] = cpu[id];
  await update(ref(db), updates);
}

function clockFor(c: MonthConditions, now: number, config: GameConfig): RoomClock {
  return stripUndefined({
    month: c.month, monthKey: monthKey(c.month), phase: 'input' as const,
    deadlineAt: now + inputSecondsFor(c.month, DEFAULT_TIMER) * 1000,
    quarterStart: canChangeBarista(c.month, config.baristaCadence),
    prices: c.prices, message: c.message,
  });
}

export async function submitRoom(
  db: Database, code: string, month: number, teamId: string, decision: MonthlyDecision, quarterly?: QuarterlyDecision,
): Promise<void> {
  const mk = monthKey(month);
  const doc = stripUndefined({ monthlyDecision: decision, quarterlyDecision: quarterly, submittedAt: serverTimestamp() });
  await update(ref(db), {
    [roomPath(code, `subs/${mk}/${teamId}`)]: doc,
    [roomPath(code, `submitted/${mk}/${teamId}`)]: serverTimestamp(),
  });
}

// 集計してよいか（全員が提出して5秒たった、または締切を過ぎた）
export function shouldCloseRoom(
  clock: RoomClock, now: number, humans: string[], submitted: Record<string, number>,
): boolean {
  if (clock.phase === 'closing') return now >= (clock.closingAt ?? 0) + CLOSING_RETRY_MS;
  if (clock.phase !== 'input') return false;
  if (now >= clock.deadlineAt + 3500) return true;
  if (humans.length === 0 || !humans.every((id) => submitted[id])) return false;
  const last = Math.max(...humans.map((id) => submitted[id]!));
  return now >= last + RESULT_DELAY_MS;
}

// 集計する。1台だけが行う（clock を closing にできた端末）
export async function closeRoomMonth(db: Database, code: string, now: number): Promise<'closed' | 'skip'> {
  const tx = await runTransaction(ref(db, roomPath(code, 'clock')), (c: RoomClock | null) => {
    if (!c) return c;
    const retry = c.phase === 'closing' && now >= (c.closingAt ?? 0) + CLOSING_RETRY_MS;
    if (c.phase !== 'input' && !retry) return undefined;
    return { ...c, phase: 'closing', closingAt: now };
  });
  if (!tx.committed) return 'skip';
  const clock = tx.snapshot.val() as RoomClock;
  const m = clock.month;
  const mk = monthKey(m);

  const [config, seats, state, subs, prevDecided, resultsRaw] = await Promise.all([
    read<GameConfig>(db, roomPath(code, 'config')),
    read<Record<string, RoomSeat>>(db, roomPath(code, 'seats')),
    read<Record<string, TeamState>>(db, roomPath(code, 'state')),
    read<Record<string, SubmissionDoc>>(db, roomPath(code, `subs/${mk}`)),
    read<Record<string, MonthlyDecision>>(db, roomPath(code, `decided/${monthKey(m - 1)}`)),
    read<Record<string, MonthResult>>(db, roomPath(code, 'results')),
  ]);
  if (!config || !seats || !state) throw new Error('ルームのデータが足りません');
  if (resultsRaw?.[mk]) return 'skip';
  const results = Object.values(asRecord<MonthResult>(resultsRaw)).sort((a, b) => a.month - b.month);
  const teams = ROOM_SEATS.map((id) => state[id]!);
  const prev = results[results.length - 1];
  const conditions: MonthConditions = {
    ...monthConditions(m, config, teams.length, prev?.prices ?? config.initialPrices),
    prices: clock.prices, ...(clock.message ? { message: clock.message } : {}),
  };

  const cpu: Record<string, CpuType> = Object.fromEntries(ROOM_SEATS.filter((id) => seats[id]!.robot).map((id) => [id, seats[id]!.robot!]));
  // つながっていない人が出さなかった席は、ロボット店長がおまかせで決める（静観のまま続かないように）
  const submittedIds = Object.keys(asRecord<SubmissionDoc>(subs));
  const auto = vacantSeats(seats).filter((id) => !submittedIds.includes(id));
  for (const id of auto) cpu[id] = AUTO_PILOT;
  const meta = await read<RoomMeta>(db, roomPath(code, 'meta'));
  const robots = robotSubmissions({
    config, teams, conditions, results, cpu, skill: SOLO_DIFFICULTY[meta?.difficulty ?? 'normal'].cpuSkill,
  });
  const humans: Submission[] = Object.entries(asRecord<SubmissionDoc>(subs))
    .filter(([id]) => !cpu[id])
    .map(([teamId, doc]) => ({
      teamId, monthlyDecision: doc.monthlyDecision,
      ...(doc.quarterlyDecision ? { quarterlyDecision: doc.quarterlyDecision } : {}), order: 0,
    }));
  const ordered = shuffleOrder([...humans, ...robots], config.market.seed, m);
  const r = closeMonth(config, teams, conditions, ordered, asRecord(prevDecided));
  const newState: Record<string, TeamState> = {};
  for (const t of r.teams) newState[t.teamId] = t;

  await update(ref(db), stripUndefined({
    [roomPath(code, `results/${mk}`)]: r.result,
    [roomPath(code, 'state')]: newState,
    [roomPath(code, `decided/${mk}`)]: r.decided,
    ...Object.fromEntries(auto.map((id) => [roomPath(code, `auto/${mk}/${id}`), true])),
    [roomPath(code, 'clock/phase')]: 'result',
    [roomPath(code, 'clock/resultAt')]: now,
  }));
  return 'closed';
}

// 「次の月へ」を押した
export async function readyNext(db: Database, code: string, month: number, teamId: string): Promise<void> {
  await set(ref(db, roomPath(code, `ready/${monthKey(month)}/${teamId}`)), serverTimestamp());
}

// 次の月へ進んでよいか（全員が押して少したった、または30秒たった）
// ready の値は押した時刻（古い版の端末は true を書く。そのときは待たずに進む）
export function shouldAdvanceRoom(
  clock: RoomClock, now: number, humans: string[], ready: Record<string, number | true>,
): boolean {
  if (clock.phase !== 'result') return false;
  if (humans.length > 0 && humans.every((id) => ready[id])) {
    const last = Math.max(...humans.map((id) => (ready[id] === true ? 0 : (ready[id] as number))));
    if (now >= last + NEXT_DELAY_MS) return true;
  }
  return now >= (clock.resultAt ?? 0) + NEXT_AUTO_MS;
}

// 次の月へ。最後の月のあとは期末。1台だけが進める（トランザクション）。
// 'final' を返すのは、期末にした端末だけ（ゲームの記録はこの端末が1件だけ送る）
export async function advanceRoom(db: Database, code: string, now: number): Promise<'next' | 'final' | 'skip'> {
  const [config, results] = await Promise.all([
    read<GameConfig>(db, roomPath(code, 'config')),
    read<Record<string, MonthResult>>(db, roomPath(code, 'results')),
  ]);
  if (!config) return 'skip';
  const tx = await runTransaction(ref(db, roomPath(code, 'clock')), (c: RoomClock | null) => {
    if (!c) return c;
    if (c.phase !== 'result') return undefined;
    const used = asRecord<MonthResult>(results)[c.monthKey]?.prices ?? c.prices;
    const next = openNextMonth(config, c.month, ROOM_SEATS.length, used);
    if (!next) return { ...c, phase: 'final' };
    return clockFor(next, now, config);
  });
  if (!tx.committed) return 'skip';
  if ((tx.snapshot.val() as RoomClock).phase === 'final') {
    await set(ref(db, roomPath(code, 'meta/status')), 'ended');
    return 'final';
  }
  return 'next';
}

export { humanSeats };
