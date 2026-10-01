// ルームモード（#/room）：だれでもルームを作り、最大4人で遊ぶ。空いた席はロボット店長。
// 画面の部品はチーム画面と同じ（入力・月の結果・期末レポート）。進行は参加している端末が自動で行う（sync/room.ts）。

import QRCode from 'qrcode';
import { get, onValue, ref, type Database } from 'firebase/database';
import { MARKET_PATTERNS } from '../../engine/config';
import type { MarketPattern, MonthlyDecision, MonthResult, TeamState } from '../../engine/types';
import { difficultyDesc, difficultyLabel, patternDesc, patternLabel } from '../../i18n/content';
import { SOLO_DIFFICULTY, type SoloDifficulty } from '../../solo/local-game';
import { signInAsTeam, waitForAuth } from '../../sync/auth';
import { asRecord } from '../../sync/codec';
import { firebase } from '../../sync/firebase';
import {
  advanceRoom, cleanupRooms, closeRoomMonth, createRoom, joinRoom, readyNext, ROOM_SEATS, roomPath, roomTeams,
  shouldAdvanceRoom, shouldCloseRoom, START_ANYONE_MS, startRoom, submitRoom, type RoomClock, type RoomMeta,
  type RoomSeat,
} from '../../sync/room';
import { monthKey, type PublicConfig, type SubmissionDoc } from '../../sync/schema';
import { buildGameLog, sendGameLog } from '../../survey/game-log';
import { esc, mmss, monthLabel, secondsLeft } from '../../ui/format';
import { renderTeamFinal } from '../report/multi';
import { DEFAULT_DECISION, mountInputView, type InputView } from '../team/input-view';
import { renderMonthStory } from '../team/month-story';

type Unsub = () => void;
const readOnce = async <T>(db: Database, path: string): Promise<T | null> => {
  const snap = await get(ref(db, path));
  return snap.exists() ? (snap.val() as T) : null;
};
const watch = <T>(db: Database, path: string, cb: (v: T | null) => void): Unsub =>
  onValue(ref(db, path), (s) => cb(s.exists() ? (s.val() as T) : null));

export async function renderRoom(root: HTMLElement, params: URLSearchParams): Promise<() => void> {
  const code = (params.get('code') ?? '').trim().toUpperCase();
  root.innerHTML = '<div class="page"><p class="muted">読み込み中…</p></div>';
  // 開発中だけ、device で別の端末のふりができる
  const device = import.meta.env.VITE_USE_EMULATOR === 'true' ? (params.get('device') ?? '') : '';
  const { auth, db } = firebase('room', device);
  await waitForAuth(auth);
  const user = await signInAsTeam(auth);
  if (!code) return renderEntry(root, db, user.uid);
  return renderPlay(root, db, user.uid, code);
}

// ---- 作る・入る ----

function renderEntry(root: HTMLElement, db: Database, uid: string): () => void {
  root.innerHTML = `<div class="page">
    <h1>🍋 ルームで対戦</h1>
    <div class="card">
      <h2>ルームに入る</h2>
      <p class="muted">ルームを作った人から聞いた6文字のコードを入れてください。ログインはいりません。</p>
      <input id="code" autocomplete="off" autocapitalize="characters" maxlength="6" class="code-input">
      <button class="btn" id="go" type="button">ルームに入る</button>
    </div>
    <div class="card">
      <h2>ルームを作る</h2>
      <p class="muted">むずかしさと市場を選んでルームを開き、友だちを待ちます（最大4人）。空いた席にはロボット店長が入ります。期間は12か月です。</p>
      <div class="start-grid"><div>
      <fieldset class="field"><legend>むずかしさ</legend>
        ${(Object.keys(SOLO_DIFFICULTY) as SoloDifficulty[]).map((d) => `<label class="radio">
          <input type="radio" name="difficulty" value="${d}" ${d === 'normal' ? 'checked' : ''}>
          <span><strong>${esc(difficultyLabel(d))}</strong><br><span class="muted">${esc(difficultyDesc(d))}</span></span>
        </label>`).join('')}
      </fieldset>
      </div><div>
      <fieldset class="field"><legend>市場のパターン</legend>
        ${(Object.keys(MARKET_PATTERNS) as MarketPattern[]).map((p) => `<label class="radio">
          <input type="radio" name="pattern" value="${p}" ${p === 'stable' ? 'checked' : ''}>
          <span><strong>${esc(patternLabel(p))}</strong><br><span class="muted">${esc(patternDesc(p))}</span></span>
        </label>`).join('')}
      </fieldset>
      </div></div>
      <button class="btn" id="create" type="button">ルームを開く</button>
      <p class="muted" id="createMsg"></p>
    </div>
    <p class="center"><a href="#/">トップにもどる</a></p></div>`;
  const input = root.querySelector<HTMLInputElement>('#code')!;
  const go = () => {
    const c = input.value.trim().toUpperCase();
    if (c.length === 6) location.hash = `#/room?code=${c}`;
  };
  root.querySelector('#go')!.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  const msg = root.querySelector<HTMLElement>('#createMsg')!;
  root.querySelector('#create')!.addEventListener('click', async (e) => {
    const btn = e.target as HTMLButtonElement;
    btn.disabled = true;
    msg.textContent = '';
    const difficulty = (root.querySelector<HTMLInputElement>('input[name="difficulty"]:checked')?.value ?? 'normal') as SoloDifficulty;
    const pattern = (root.querySelector<HTMLInputElement>('input[name="pattern"]:checked')?.value ?? 'stable') as MarketPattern;
    try {
      if ((await cleanupRooms(db, Date.now())) === 'busy') {
        msg.innerHTML = 'いまは混み合っています。少したってからもう一度試すか、<a href="#/solo">ソロモード</a>で遊んでください。';
        btn.disabled = false;
        return;
      }
      const code = await createRoom(db, uid, { difficulty, pattern, now: Date.now() });
      location.hash = `#/room?code=${code}`;
    } catch {
      // 1人が同時に開けるルームは1つ。前に作ったルームがあれば案内する
      const mine = await readOnce<string>(db, `roomOwners/${uid}`).catch(() => null);
      msg.innerHTML = mine
        ? `前に作ったルームがまだ開いています。<a href="#/room?code=${esc(mine)}">ルーム ${esc(mine)} にもどる</a>（終わったルームは、期末になるか6時間たつと、新しく作れるようになります）`
        : 'ルームを作れませんでした。少したってからもう一度試してください。';
      btn.disabled = false;
    }
  });
  return () => {};
}

// ---- 遊ぶ ----

function renderPlay(root: HTMLElement, db: Database, uid: string, code: string): () => void {
  const S = {
    meta: undefined as RoomMeta | null | undefined,
    pub: null as PublicConfig | null,
    clock: null as RoomClock | null,
    seats: {} as Record<string, RoomSeat>,
    state: {} as Record<string, TeamState>,
    results: [] as MonthResult[],
    submitted: {} as Record<string, number>,
    ready: {} as Record<string, true>,
    ownSub: null as SubmissionDoc | null,
    offset: 0,
  };
  const now = () => Date.now() + S.offset;
  const myTeam = () => Object.entries(S.seats).find(([, s]) => s.uid === uid)?.[0] ?? null;
  const humans = () => ROOM_SEATS.filter((id) => S.seats[id]?.uid && !S.seats[id]?.robot);

  root.innerHTML = `<div class="page">
    <div class="topbar"><span class="team" id="teamname">🍋 ルーム ${esc(code)}</span><span class="muted" id="month"></span><span class="timer" id="timer"></span></div>
    <div id="status"></div>
    <div id="view"></div></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const view = $('view');
  let viewKey = '';
  let inputView: InputView | null = null;
  let joinTried = false;
  let seen = false;

  async function render() {
    if (S.meta === null) {
      viewKey = 'gone';
      view.innerHTML = `<div class="card center"><h2>${seen ? 'ルームは終了しました' : 'ルームが見つかりません'}</h2>
        <p class="muted">${seen ? '時間がたったので、ルームのデータが消えました。' : `コード「${esc(code)}」のルームはありません。`}</p>
        <a class="btn" href="#/room">ルームの画面へ</a></div>`;
      return;
    }
    const c = S.clock;
    if (!S.meta || !S.pub || !c) return;
    seen = true;
    const me = myTeam();
    // まだ座っていなければ、空いている席に座る（開始前だけ）
    if (!me && c.phase === 'lobby' && !joinTried) {
      joinTried = true;
      joinRoom(db, code, uid).catch(() => render());
      return;
    }
    const teams = roomTeams(S.seats);
    $('teamname').textContent = me ? `🍋 ${teams[me]!.name}` : `🍋 ルーム ${code}`;
    $('month').textContent = c.month > 0 ? monthLabel(c.month, S.pub.startCalendarMonth, S.pub.months) : '';
    $('status').innerHTML = c.phase === 'input'
      ? `<p class="muted center" style="margin:0 0 8px">提出 ${humans().filter((id) => S.submitted[id]).length} / ${humans().length} 人（ロボット店長は自動）。全員そろうと5秒後に結果が出ます。</p>`
      : '';

    if (!me) {
      viewKey = 'full';
      view.innerHTML = `<div class="card center"><h2>このルームには入れません</h2>
        <p class="muted">${c.phase === 'lobby' ? '満席です（最大4人）。' : 'もう始まっています。'}</p>
        <a class="btn" href="#/room">ルームの画面へ</a></div>`;
      return;
    }

    if (c.phase === 'lobby') return renderLobby(me);
    if (c.phase === 'input') return renderInput(me, c);
    inputView = null;
    if (c.phase === 'closing') {
      if (viewKey !== 'closing') { viewKey = 'closing'; view.innerHTML = '<div class="card center">集計中…</div>'; }
      return;
    }
    if (c.phase === 'result') {
      const result = S.results.find((r) => r.month === c.month);
      const key = `result-${c.month}-${!!result}`;
      if (viewKey === key || !result) return;
      viewKey = key;
      const previous = S.results.find((r) => r.month === c.month - 1);
      const last = c.month >= S.pub.months;
      renderMonthStory(view, result, me, teams, {
        recipe: S.pub.recipe, baristaCapacity: S.pub.baristaCapacity, ...(previous ? { previous } : {}),
        nextLabel: last ? '期末の結果へ' : '次の月へ',
        onNext: () => {
          readyNext(db, code, c.month, me).catch(() => {});
          view.querySelector('.result-next')?.insertAdjacentHTML('afterbegin',
            '<p class="muted center">ほかの人を待っています（30秒で自動で進みます）</p>');
        },
      });
      return;
    }
    if (c.phase === 'final') {
      const key = `final-${S.results.length}`;
      if (viewKey === key) return;
      viewKey = key;
      renderTeamFinal(view, { results: S.results, state: S.state, teams, pub: S.pub }, me, {
        note: 'おつかれさまでした！ もう一度遊ぶときは、ルームの画面から新しいルームを作ってね。',
      });
    }
  }

  function renderLobby(me: string) {
    const owner = S.meta!.ownerUid === uid;
    const canStart = owner || now() >= S.meta!.createdAt + START_ANYONE_MS;
    const key = `lobby-${JSON.stringify(S.seats)}-${canStart}`;
    if (viewKey === key) return;
    viewKey = key;
    const url = `${location.origin}${location.pathname}#/room?code=${code}`;
    const joined = humans().length;
    view.innerHTML = `<div class="card center">
        <h2>ルーム ${esc(code)}</h2>
        <p class="muted">友だちに、このコードか QR コードを送ってね（最大4人）。</p>
        <div class="room-qr" id="qr"></div>
        <p class="muted" style="word-break:break-all">${esc(url)}</p>
      </div>
      <div class="card">
        <h2>参加している人（${joined}/4）</h2>
        <p class="muted">むずかしさ：${esc(difficultyLabel(S.meta!.difficulty))}　市場：${esc(S.pub!.pattern ? patternLabel(S.pub!.pattern) : '—')}</p>
        ${ROOM_SEATS.map((id) => {
          const s = S.seats[id];
          return `<div class="team-tile ${s?.uid ? 'on' : ''}">${s?.uid ? '👤' : '…'} ${esc(s?.name ?? id)}${id === me ? '（あなた）' : ''}${!s?.uid ? '<span class="muted">（空き。はじめるとロボット店長）</span>' : ''}</div>`;
        }).join('')}
        ${canStart
          ? `<button class="btn" id="start" type="button">はじめる（空いた席はロボット店長）</button>`
          : '<p class="muted center">ルームを作った人が「はじめる」を押すのを待っています。5分たつと、だれでも始められます。</p>'}
      </div>`;
    QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => { const el = view.querySelector('#qr'); if (el) el.innerHTML = svg; }).catch(() => {});
    view.querySelector('#start')?.addEventListener('click', async (e) => {
      (e.target as HTMLButtonElement).disabled = true;
      await startRoom(db, code, now()).catch(() => { (e.target as HTMLButtonElement).disabled = false; });
    });
  }

  let ownKey = '';
  let unsubOwn: Unsub | null = null;
  function followOwn(me: string, month: number) {
    const k = `${me}-${month}`;
    if (k === ownKey) return;
    ownKey = k;
    unsubOwn?.();
    S.ownSub = null;
    unsubOwn = watch<SubmissionDoc>(db, roomPath(code, `subs/${monthKey(month)}/${me}`), (v) => { S.ownSub = v; render(); });
  }

  function renderInput(me: string, c: RoomClock) {
    followOwn(me, c.month);
    const mine = S.state[me];
    if (!mine) return;
    const last = S.results.find((r) => r.month === c.month - 1);
    const ctx = {
      pub: S.pub!, clock: c, me: mine, ownSub: S.ownSub, closed: secondsLeft(c.deadlineAt, now()) === 0,
      ...(last ? { lastMonth: { result: last, teams: roomTeams(S.seats) } } : {}),
    };
    const key = `input-${c.month}`;
    if (viewKey === key && inputView) { inputView.update(ctx); return; }
    viewKey = key;
    // 入力欄のはじめの値：先月の自分の決定（なければ既定値）
    const prev = last?.teamResults.find((t) => t.teamId === me);
    const decision: MonthlyDecision = prev && prev.offered > 0
      ? { lemonQty: prev.lemonBought, sugarQty: prev.sugarBought, price: prev.price } : DEFAULT_DECISION;
    inputView = mountInputView(view, ctx, { decision, baristaCount: mine.baristaCount }, async (d, baristaCount) => {
      await submitRoom(db, code, c.month, me, d, baristaCount !== undefined ? { baristaCount } : undefined);
    });
  }

  // 進行：締切・集計・次の月（参加している端末のどれかが行う。二重に進まないよう sync 側でトランザクション）
  let busy = false;
  async function autopilot() {
    const c = S.clock;
    if (!c || busy || !myTeam()) return;
    busy = true;
    try {
      if (shouldCloseRoom(c, now(), humans(), S.submitted)) await closeRoomMonth(db, code, now());
      else if (shouldAdvanceRoom(c, now(), humans(), S.ready)) {
        // 期末にしたのがこの端末なら、ゲームの記録を1件だけ送る（失敗しても遊びには影響しない）
        if ((await advanceRoom(db, code, now())) === 'final') sendLog();
      }
    } catch {
      // ほかの端末が先に進めた、など。次の見回りでやり直す
    } finally {
      busy = false;
    }
  }

  async function sendLog() {
    const [results, state] = await Promise.all([
      readOnce<Record<string, MonthResult>>(db, roomPath(code, 'results')),
      readOnce<Record<string, TeamState>>(db, roomPath(code, 'state')),
    ]);
    if (!S.meta || !S.pub || !results || !state) return;
    const robots = Object.fromEntries(ROOM_SEATS.filter((id) => S.seats[id]?.robot).map((id) => [id, S.seats[id]!.robot!]));
    const names = Object.fromEntries(ROOM_SEATS.map((id) => [id, S.seats[id]?.name ?? id]));
    await sendGameLog(buildGameLog({
      code, difficulty: S.meta.difficulty, ...(S.pub.pattern ? { pattern: S.pub.pattern } : {}),
      results: Object.values(results).sort((a, b) => a.month - b.month), state, names, robots,
      recipe: S.pub.recipe, appVersion: __APP_VERSION__,
    })).catch(() => false);
  }

  const tick = setInterval(() => {
    const c = S.clock;
    const t = $('timer');
    if (c?.phase === 'input') {
      const left = secondsLeft(c.deadlineAt, now());
      t.textContent = `⏱ ${mmss(left)}`;
      t.classList.toggle('urgent', left <= 15);
      if (left === 0 && inputView) render();
    } else t.textContent = '';
    if (c?.phase === 'lobby') render(); // 5分たったら「はじめる」を出す
    autopilot();
  }, 500);

  let monthWatch: Unsub[] = [];
  let followed = -1;
  const unsubs: Unsub[] = [
    watch<number>(db, '.info/serverTimeOffset', (v) => { S.offset = v ?? 0; }),
    watch<RoomMeta>(db, roomPath(code, 'meta'), (v) => { S.meta = v; render(); }),
    watch<PublicConfig>(db, roomPath(code, 'public'), (v) => { S.pub = v; render(); }),
    watch<Record<string, RoomSeat>>(db, roomPath(code, 'seats'), (v) => { S.seats = asRecord(v); render(); }),
    watch<Record<string, TeamState>>(db, roomPath(code, 'state'), (v) => { S.state = asRecord(v); render(); }),
    watch<Record<string, MonthResult>>(db, roomPath(code, 'results'), (v) => {
      S.results = Object.values(asRecord<MonthResult>(v)).sort((a, b) => a.month - b.month);
      render();
    }),
    watch<RoomClock>(db, roomPath(code, 'clock'), (v) => {
      S.clock = v;
      if (v && v.month !== followed && myTeam()) {
        followed = v.month;
        monthWatch.forEach((u) => u());
        S.submitted = {};
        S.ready = {};
        monthWatch = [
          watch<Record<string, number>>(db, roomPath(code, `submitted/${v.monthKey}`), (x) => { S.submitted = asRecord(x); render(); }),
          watch<Record<string, true>>(db, roomPath(code, `ready/${v.monthKey}`), (x) => { S.ready = asRecord(x); render(); }),
        ];
      }
      render();
    }),
  ];
  return () => {
    clearInterval(tick);
    unsubs.forEach((u) => u());
    monthWatch.forEach((u) => u());
    unsubOwn?.();
  };
}
