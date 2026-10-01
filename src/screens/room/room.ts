// ルームモード（#/room）：だれでもルームを作り、最大4人で遊ぶ。空いた席はロボット店長。
// 画面の部品はチーム画面と同じ（入力・月の結果・期末レポート）。進行は参加している端末が自動で行う（sync/room.ts）。

import { reloadIfStale } from '../../ui/fresh';
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
  endRoom, goOnline, keepOnline, onlineHumans, takeOverSeat, vacantSeats,
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
  void reloadIfStale(); // 公開前から開いていた古い画面なら、新しい版に読みこみ直す
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
    ready: {} as Record<string, number | true>,
    auto: {} as Record<string, Record<string, true>>, // 月ごとの、ロボット店長がおまかせで決めた席
    ownSub: null as SubmissionDoc | null,
    offset: 0,
  };
  const now = () => Date.now() + S.offset;
  const myTeam = () => Object.entries(S.seats).find(([, s]) => s.uid === uid)?.[0] ?? null;
  const humans = () => ROOM_SEATS.filter((id) => S.seats[id]?.uid && !S.seats[id]?.robot);
  // 待つのは、いまつながっている人だけ（抜けた人を待って止まらないように）
  const waitFor = () => onlineHumans(S.seats);

  root.innerHTML = `<div class="page">
    <div class="topbar"><span class="team" id="teamname">🍋 ルーム ${esc(code)}</span><span class="muted" id="month"></span><span class="timer" id="timer"></span></div>
    <div id="status"></div>
    <div id="view"></div></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const view = $('view');
  let viewKey = '';
  let inputView: InputView | null = null;
  let joinTried = false;
  let onlineFor: string | null = null;
  let stopOnline: (() => void) | null = null;
  let fixedAt = 0;
  let lastStatus = '';
  let editing = false; // 提出したあと「決定をなおす」を押した
  let editMonth = 0;
  let readyFor = 0; // 「次の月へ」を押した月
  let endArmed = false; // 「ゲームを終わる」を1回押した（アプリ内ブラウザでは confirm が出ないことがあるので、画面の中で確かめる）
  // ボタンが書きかわっても押せるよう、外側で受ける
  $('status').addEventListener('click', async (e) => {
    const id = (e.target as HTMLElement).closest('button')?.id;
    if (id === 'endCancel') { endArmed = false; render(); return; }
    if (id !== 'endGame') return;
    const me = myTeam();
    if (!me) return;
    if (!endArmed) { endArmed = true; render(); return; }
    endArmed = false;
    if ((await endRoom(db, code, roomTeams(S.seats)[me]!.name).catch(() => 'skip')) === 'final') sendLog();
  });
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
    // 座っていたら「つながっている」を記録する（切れると自動で外れ、ほかの人が入り直せるようになる）
    if (me && onlineFor !== me) {
      stopOnline?.();
      onlineFor = me;
      stopOnline = keepOnline(db, code, me);
    } else if (me && S.seats[me]?.online === false && Date.now() - fixedAt > 3000) {
      // 同じ端末の古いタブが閉じたときなど、つながっているのに false になったら直す
      fixedAt = Date.now();
      goOnline(db, code, me).catch(() => {});
    }
    const teams = roomTeams(S.seats);
    $('teamname').textContent = me ? `🍋 ${teams[me]!.name}` : `🍋 ルーム ${code}`;
    $('month').textContent = c.month > 0 ? monthLabel(c.month, S.pub.startCalendarMonth, S.pub.months) : '';
    const away = vacantSeats(S.seats);
    const canEnd = me && (S.meta.ownerUid === uid || !onlineHumans(S.seats).some((id) => S.seats[id]?.uid === S.meta!.ownerUid));
    // 提出した人数は出さない（だれが最後に押したか分からないように）
    const statusHtml = (c.phase === 'input' && !(S.ownSub && !editing)
      ? '<p class="muted center" style="margin:0 0 8px">全員が提出すると、少しして結果が出ます（ロボット店長は自動）。</p>'
      : '')
      + (away.length > 0 && c.phase !== 'lobby' && c.phase !== 'final'
        ? `<p class="muted center" style="margin:0 0 8px">🔌 つながっていない人：${away.map((id) => esc(teams[id]!.name)).join('、')}（出さなかった月はロボット店長がおまかせで決めます。同じリンクを開くと入り直せます）</p>`
        : '')
      + (canEnd && ['input', 'result'].includes(c.phase)
        ? (endArmed
          ? '<p class="center" style="margin:0 0 8px">ここまでの月の結果で期末にします。<br><button class="small" id="endGame" type="button">本当に終わる</button> <button class="small secondary" id="endCancel" type="button">やめる</button></p>'
          : '<p class="center" style="margin:0 0 8px"><button class="small" id="endGame" type="button">ゲームを終わる</button></p>')
        : '');
    // 中身が変わったときだけ書きかえる（押している途中でボタンが入れかわって押せない、を防ぐ）
    if (lastStatus !== statusHtml) { lastStatus = statusHtml; $('status').innerHTML = statusHtml; }

    if (!me) {
      // つながっていない人の席があれば、その席で入り直せる
      const key = `full-${away.join(',')}-${c.phase}`;
      if (viewKey === key) return;
      viewKey = key;
      view.innerHTML = away.length > 0 && c.phase !== 'final' && c.phase !== 'lobby'
        ? `<div class="card center"><h2>入り直す席を選んでください</h2>
            <p class="muted">つながっていない人の席から続けられます。お金や材料はその席のままです。</p>
            ${away.map((id) => `<button class="btn" type="button" data-take="${id}">${esc(teams[id]!.name)} で入り直す</button>`).join('')}
            <p><a href="#/room">ルームの画面へ</a></p></div>`
        : `<div class="card center"><h2>このルームには入れません</h2>
            <p class="muted">${c.phase === 'lobby' ? '満席です（最大4人）。' : c.phase === 'final' ? 'このゲームは終わりました。' : 'もう始まっていて、空いている席がありません。'}</p>
            <a class="btn" href="#/room">ルームの画面へ</a></div>`;
      view.querySelectorAll<HTMLButtonElement>('button[data-take]').forEach((b) => b.addEventListener('click', async () => {
        b.disabled = true;
        await takeOverSeat(db, code, uid, b.dataset.take!).catch(() => {
          alert('入り直せませんでした。その席の人がつながったのかもしれません。');
          b.disabled = false;
        });
      }));
      return;
    }

    if (c.phase === 'lobby') return renderLobby(me);
    if (c.phase === 'input') return renderInput(me, c);
    inputView = null;
    if (c.phase === 'closing') return showPreparing('closing');
    if (c.phase === 'result') {
      // 「次の月へ」を押したら、全員そろって進むまで「準備中…」
      if (me && (S.ready[me] || readyFor === c.month)) return showPreparing(`ready-${c.month}`);
      const result = S.results.find((r) => r.month === c.month);
      const key = `result-${c.month}-${!!result}`;
      if (viewKey === key || !result) return;
      viewKey = key;
      const previous = S.results.find((r) => r.month === c.month - 1);
      const last = c.month >= S.pub.months;
      const autoNow = S.auto[monthKey(c.month)] ?? {};
      const shown = Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, autoNow[id] ? { ...t, name: `${t.name}（おまかせ）` } : t]));
      renderMonthStory(view, result, me, shown, {
        recipe: S.pub.recipe, baristaCapacity: S.pub.baristaCapacity, ...(previous ? { previous } : {}),
        nextLabel: last ? '期末の結果へ' : '次の月へ',
        onNext: () => {
          readyFor = c.month;
          readyNext(db, code, c.month, me).catch(() => {});
          render();
        },
      });
      return;
    }
    if (c.phase === 'final') {
      const key = `final-${S.results.length}`;
      if (viewKey === key) return;
      viewKey = key;
      renderTeamFinal(view, { results: S.results, state: S.state, teams, pub: S.pub }, me, {
        ...(c.endedEarlyBy && S.results.length < 12 ? { heading: S.results.length > 0 ? `${S.results.length}か月間おつかれさまでした！` : `おつかれさまでした！` } : {}),
        note: `${c.endedEarlyBy ? `${esc(c.endedEarlyBy)} が ${c.month}か月目でゲームを終わりにしました。` : ''}おつかれさまでした！ もう一度遊ぶときは、ルームの画面から新しいルームを作ってね。`,
      });
      // 途中で終わったとき、終えた人以外には、だれが終えたかを上に大きく出す（急に終わって驚かないように）
      if (c.endedEarlyBy && (!me || teams[me]?.name !== c.endedEarlyBy)) {
        const ownerSeat = ROOM_SEATS.find((id) => S.seats[id]?.uid === S.meta!.ownerUid);
        const who = ownerSeat && teams[ownerSeat]?.name === c.endedEarlyBy ? 'ホスト' : esc(c.endedEarlyBy);
        view.insertAdjacentHTML('afterbegin', `<div class="card center" style="border:2px solid var(--accent, #f5b800)">
          <h2 style="margin:0 0 4px">🏁 ${who}がゲームを終了しました</h2>
          <p class="muted" style="margin:0">${c.month}か月目で終わりました。ここまでの結果を見てみましょう。</p></div>`);
      }
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
        <p class="notice" style="text-align:left">LINE などのアプリの中で開いた人は、右上のメニューから「Safari／Chrome で開く」を選んでから参加してね。アプリの中だと、読み込み直したときに別の人として扱われることがあります。</p>
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

  // 「提出する」「次の月へ」を押したあとの待ち画面（みんな同じ画面なので、だれが最後か分からない）
  function showPreparing(key: string, canEdit = false) {
    inputView = null;
    const k = `prep-${key}`;
    if (viewKey === k) return;
    viewKey = k;
    view.innerHTML = `<div class="card center preparing" style="min-height:55vh;display:flex;flex-direction:column;justify-content:center;align-items:center">
      <div class="wobble" style="font-size:3rem;line-height:1">🍋</div>
      <h2 style="margin:12px 0 6px">他チームの準備中…</h2>
      <p class="muted" style="margin:0">みんながそろったら、次の画面に進みます。</p>
      ${canEdit ? '<p style="margin:12px 0 0"><button class="small secondary" id="editAgain" type="button">決定をなおす</button></p>' : ''}
    </div>`;
    view.querySelector('#editAgain')?.addEventListener('click', () => { editing = true; render(); });
  }

  function renderInput(me: string, c: RoomClock) {
    followOwn(me, c.month);
    if (editMonth !== c.month) { editMonth = c.month; editing = false; }
    // 提出したら「準備中…」（締切までは「決定をなおす」で入力にもどれる）
    if (S.ownSub && !editing) return showPreparing(`input-${c.month}`, secondsLeft(c.deadlineAt, now()) > 0);
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
    const decision: MonthlyDecision = S.ownSub ? S.ownSub.monthlyDecision : prev && prev.offered > 0
      ? { lemonQty: prev.lemonBought, sugarQty: prev.sugarBought, price: prev.price } : DEFAULT_DECISION;
    inputView = mountInputView(view, ctx, { decision, baristaCount: mine.baristaCount }, async (d, baristaCount) => {
      await submitRoom(db, code, c.month, me, d, baristaCount !== undefined ? { baristaCount } : undefined);
      editing = false;
      render();
    });
  }

  // 進行：締切・集計・次の月（参加している端末のどれかが行う。二重に進まないよう sync 側でトランザクション）
  let busy = false;
  async function autopilot() {
    const c = S.clock;
    if (!c || busy || !myTeam()) return;
    busy = true;
    try {
      if (shouldCloseRoom(c, now(), waitFor(), S.submitted)) await closeRoomMonth(db, code, now());
      else if (shouldAdvanceRoom(c, now(), waitFor(), S.ready)) {
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
  // その月の提出・「次の月へ」を受け取る（参加者だけが読める。途中から入り直したときも、ここで受け取りはじめる）
  function followMonth() {
    const v = S.clock;
    if (!v || v.month === followed || !myTeam()) return;
    followed = v.month;
    monthWatch.forEach((u) => u());
    S.submitted = {};
    S.ready = {};
    monthWatch = [
      watch<Record<string, number>>(db, roomPath(code, `submitted/${v.monthKey}`), (x) => { S.submitted = asRecord(x); render(); }),
      watch<Record<string, number | true>>(db, roomPath(code, `ready/${v.monthKey}`), (x) => { S.ready = asRecord(x); render(); }),
    ];
  }
  const unsubs: Unsub[] = [
    watch<number>(db, '.info/serverTimeOffset', (v) => { S.offset = v ?? 0; }),
    watch<RoomMeta>(db, roomPath(code, 'meta'), (v) => { S.meta = v; render(); }),
    watch<PublicConfig>(db, roomPath(code, 'public'), (v) => { S.pub = v; render(); }),
    watch<Record<string, RoomSeat>>(db, roomPath(code, 'seats'), (v) => { S.seats = asRecord(v); followMonth(); render(); }),
    watch<Record<string, TeamState>>(db, roomPath(code, 'state'), (v) => { S.state = asRecord(v); render(); }),
    watch<Record<string, MonthResult>>(db, roomPath(code, 'results'), (v) => {
      S.results = Object.values(asRecord<MonthResult>(v)).sort((a, b) => a.month - b.month);
      render();
    }),
    watch<Record<string, Record<string, true>>>(db, roomPath(code, 'auto'), (v) => { S.auto = asRecord(v); viewKey = ''; render(); }),
    watch<RoomClock>(db, roomPath(code, 'clock'), (v) => {
      S.clock = v;
      followMonth();
      render();
    }),
  ];
  return () => {
    clearInterval(tick);
    unsubs.forEach((u) => u());
    monthWatch.forEach((u) => u());
    unsubOwn?.();
    stopOnline?.();
  };
}
