// GM の進行画面：待機 → 入力（タイマー・提出状況・締切）→ 結果 → 次の月 → 期末 → 削除

import QRCode from 'qrcode';
import { renderGmFinal } from '../report/multi';
import { gmNote } from './facilitation';
import type { Database } from 'firebase/database';
import type { MonthResult, TeamState, TimerSettings } from '../../engine/types';
import {
  closeCurrentMonth, deleteGame, extendDeadline, readPath, releaseTeam, shouldAutoClose, sortedTeams, startGame,
  startNextMonth,
} from '../../sync/game';
import type { Clock, GameMeta, PublicConfig, TeamSlot } from '../../sync/schema';
import {
  watchClock, watchHidden, watchMeta, watchPublic, watchResults, watchServerOffset, watchState, watchSubmitted,
  watchTeams,
} from '../../sync/watch';
import { calendarMonth, esc, mmss, monthLabel, secondsLeft, signedYen, yen } from '../../ui/format';
import { isWatching } from '../team/result-view';

export function mountGameView(root: HTMLElement, db: Database, gmUid: string, code: string): () => void {
  const S = {
    meta: undefined as GameMeta | null | undefined,
    pub: null as PublicConfig | null,
    clock: null as Clock | null,
    teams: {} as Record<string, TeamSlot>,
    state: {} as Record<string, TeamState>,
    results: [] as MonthResult[],
    submitted: {} as Record<string, true>,
    budget: null as number | null,
    timer: null as TimerSettings | null,
    offset: 0,
  };
  const unsubs: (() => void)[] = [];
  const serverNow = () => Date.now() + S.offset;

  const base = `${location.origin}${location.pathname}`;
  const teamUrl = `${base}#/team?code=${code}`;
  const screenUrl = `${base}#/screen?code=${code}`;

  root.innerHTML = `<div class="page wide">
    <div class="topbar">
      <span><a href="#/gm">← ゲーム一覧</a></span>
      <span class="muted" id="month"></span>
      <span class="timer" id="timer"></span>
    </div>
    <div class="card gm-join">
      <div>
        <div class="gm-code">ゲームコード <strong>${esc(code)}</strong></div>
        <p class="muted" style="margin:4px 0 0">
          チームの参加用：<a href="${teamUrl}" target="_blank">${esc(teamUrl)}</a><br>
          全体表示（プロジェクター用）：<a href="${screenUrl}" target="_blank">${esc(screenUrl)}</a></p>
      </div>
      <div class="qr" id="qr" title="チームの参加用 QR コード"></div>
    </div>
    <div class="card gm-note" id="note"></div>
    <div id="main"></div>
    <div class="card danger">
      <h2>ゲームの終了</h2>
      <p class="muted">終了すると、このゲームのデータ（チーム名・決定・結果）をすべて削除します。元には戻せません。</p>
      <button class="btn secondary" id="delete">ゲームを終了してデータを削除</button>
    </div></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const main = $('main');
  // 参加用の QR コード（全体表示と同じ。プロジェクターを使わないときに、GM の画面を見せて参加してもらう）
  QRCode.toString(teamUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
    .then((svg) => { $('qr').innerHTML = svg; })
    .catch(() => { $('qr').remove(); });

  $('delete').addEventListener('click', async () => {
    if (!confirm(`ゲーム ${code} を終了して、データをすべて削除しますか？\n元には戻せません。`)) return;
    cleanup();
    await deleteGame(db, code, gmUid);
    location.hash = '#/gm';
  });

  // ---- 自動の締切（GM の端末で行う） ----
  let closing = false;
  async function checkAutoClose() {
    const c = S.clock;
    if (!c || !S.timer || closing) return;
    const joined = Object.entries(S.teams).filter(([, t]) => t.uid).map(([id]) => id);
    if (!shouldAutoClose(c, serverNow(), joined, Object.keys(S.submitted), S.timer.closeWhenAllSubmitted)) return;
    closing = true;
    try { await closeCurrentMonth(db, code); } finally { closing = false; }
  }
  const tick = setInterval(() => {
    const c = S.clock;
    const t = $('timer');
    if (c?.phase === 'input') {
      const left = secondsLeft(c.deadlineAt, serverNow());
      t.textContent = left > 0 ? `⏱ ${mmss(left)}` : '⏱ 締切・集計中';
      t.classList.toggle('urgent', left <= 15);
    } else t.textContent = '';
    checkAutoClose();
  }, 250);
  // 別のウィンドウ（プロジェクター）を操作している間はタブのタイマーが遅れるので、戻ったときにも確かめる
  const onVisible = () => checkAutoClose();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  function cleanup() {
    clearInterval(tick);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    unsubs.forEach((u) => u());
  }

  // ---- 表示 ----
  let lastKey = '';
  function render() {
    if (S.meta === null) { main.innerHTML = '<div class="card">このゲームは見つかりません（削除された可能性があります）。</div>'; return; }
    if (S.meta && S.meta.gmUid !== gmUid) { main.innerHTML = '<div class="card">このゲームの GM ではありません。</div>'; return; }
    const c = S.clock;
    if (!c || !S.pub) return;
    $('month').textContent = c.month > 0 ? monthLabel(c.month, S.pub.startCalendarMonth) : '開始前';

    renderNote(c);
    const slots = sortedTeams(S.teams);
    if (c.phase === 'lobby') return renderLobby(slots);
    if (c.phase === 'input') return renderInput(c, slots);
    if (c.phase === 'result') return renderResult(c, slots);
    if (c.phase === 'final') return renderFinal();
  }

  function renderLobby(slots: { teamId: string; slot: TeamSlot }[]) {
    const joined = slots.filter((s) => s.slot.uid).length;
    main.innerHTML = `<div class="card">
      <h2>参加を待っています（${joined}/${slots.length}チーム）</h2>
      <table class="table">${slots.map(({ teamId, slot }) => `<tr>
        <td>${esc(slot.name)}</td>
        <td>${slot.uid ? '✅ 参加' : '<span class="muted">まだ</span>'}</td>
        <td>${slot.uid ? `<button class="small" data-release="${teamId}">解除</button>` : ''}</td></tr>`).join('')}</table>
      <p class="muted">「解除」すると、そのチームに別の端末から参加し直せます（端末を替えたとき用）。</p>
      ${joined > 0 && joined < slots.length ? `
        <button class="btn" id="startDrop">参加チームだけで始める（未参加の${slots.length - joined}チームを外す）</button>
        <p class="muted" style="margin:4px 0 8px">外すと、市場の大きさ（お客さんのお金）も${joined}チーム分になります。</p>
        <button class="btn secondary" id="start">全チームで始める（未参加は静観。途中から参加できる）</button>`
      : `<button class="btn" id="start" ${joined === 0 ? 'disabled' : ''}>1か月目を始める</button>
        ${joined === 0 ? '<p class="muted">チームが参加すると始められます。</p>' : ''}`}
    </div>`;
    bindRelease();
    const start = async (e: Event, dropUnjoined: boolean) => {
      main.querySelectorAll<HTMLButtonElement>('#start, #startDrop').forEach((b) => (b.disabled = true));
      try {
        await startGame(db, code, serverNow(), { dropUnjoined });
      } catch (err) {
        alert(`始められませんでした：${(err as Error).message}`);
        (e.target as HTMLButtonElement).disabled = false;
      }
    };
    main.querySelector('#startDrop')?.addEventListener('click', (e) => start(e, true));
    main.querySelector('#start')!.addEventListener('click', (e) => start(e, false));
  }

  function renderInput(c: Clock, slots: { teamId: string; slot: TeamSlot }[]) {
    const done = slots.filter((s) => S.submitted[s.teamId]).length;
    main.innerHTML = `<div class="card">
      <h2>入力中：${done}/${slots.length}チームが提出</h2>
      ${c.message ? `<div class="notice">📰 ${esc(c.message)}</div>` : ''}
      <div class="chips" style="margin-bottom:8px">
        <span class="chip">🍋 ${yen(c.prices.lemon)}</span><span class="chip">🍬 ${yen(c.prices.sugar)}</span>
        <span class="chip">👩‍🍳 ${yen(c.prices.barista)}</span>
        ${S.budget !== null ? `<span class="chip">市場予算 ${yen(S.budget)}（チームには非公開）</span>` : ''}
        ${c.quarterStart && S.pub?.baristaCadence !== 'monthly' ? '<span class="chip">バリスタを決める月</span>' : ''}
      </div>
      <table class="table">${slots.map(({ teamId, slot }) => `<tr>
        <td>${esc(slot.name)}</td>
        <td>${S.submitted[teamId] ? '✅ 提出済み' : slot.uid ? '<span class="muted">入力中…</span>' : '<span class="muted">未参加（静観）</span>'}</td>
        <td>${slot.uid ? `<button class="small" data-release="${teamId}">解除</button>` : ''}</td></tr>`).join('')}</table>
      <p class="muted">締切までに提出しなかったチームは、先月と同じ決定で進みます（1か月目は静観）。</p>
      <div class="row2">
        <button class="btn secondary" id="extend">＋30秒</button>
        <button class="btn" id="close">いま締め切る</button>
      </div></div>`;
    bindRelease();
    main.querySelector('#extend')!.addEventListener('click', () => extendDeadline(db, code, 30));
    main.querySelector('#close')!.addEventListener('click', async (e) => {
      if (done < slots.length && !confirm('まだ提出していないチームがあります。締め切りますか？')) return;
      (e.target as HTMLButtonElement).disabled = true;
      await closeCurrentMonth(db, code);
    });
  }

  function renderResult(c: Clock, slots: { teamId: string; slot: TeamSlot }[]) {
    const result = S.results.find((r) => r.month === c.month);
    if (!result) { main.innerHTML = '<div class="card">集計中…</div>'; return; }
    const isLast = S.pub && c.month >= S.pub.months;
    const byId = new Map(result.teamResults.map((r) => [r.teamId, r]));
    main.innerHTML = `<div class="card">
      <h2>${c.month}か月目の結果</h2>
      <p class="muted">市場予算 ${yen(result.marketBudget)} ／ 売上の合計 ${yen(result.teamResults.reduce((a, r) => a + r.revenue, 0))}</p>
      <table class="table">
        <tr><th>チーム</th><th>値段</th><th>売れた/出した</th><th>売上</th><th>費用</th><th>もうけ</th><th>お金の残り</th></tr>
        ${slots.map(({ teamId, slot }) => {
          const r = byId.get(teamId);
          if (!r) return '';
          return `<tr><td>${esc(slot.name)}</td><td>${r.offered === 0 ? (isWatching(r) ? '静観' : '—') : yen(r.price)}</td>
            <td>${r.sold}/${r.offered}杯</td><td>${yen(r.revenue)}</td><td>${yen(r.totalCost)}</td>
            <td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td><td>${yen(r.balance)}</td></tr>`;
        }).join('')}
      </table>
      <button class="btn" id="next">${isLast ? '期末の結果へ' : '次の月へ'}</button></div>`;
    main.querySelector('#next')!.addEventListener('click', async (e) => {
      (e.target as HTMLButtonElement).disabled = true;
      await startNextMonth(db, code, serverNow());
    });
  }

  function renderFinal() {
    if (!S.pub) return;
    renderGmFinal(main, { results: S.results, state: S.state, teams: S.teams, pub: S.pub });
    main.insertAdjacentHTML('beforeend', '<p class="muted">振り返りが終わったら、下の「ゲームを終了してデータを削除」でデータを消してください。</p>');
  }

  // いま話すこと（docs/facilitation-guide.md の短い版）
  function renderNote(c: Clock) {
    if (!S.pub) return;
    const n = gmNote({
      phase: c.phase, month: c.month, months: S.pub.months, quarterStart: c.quarterStart,
      baristaMonthly: S.pub.baristaCadence === 'monthly',
      seasonal: S.pub.pattern === 'realistic', calendarMonth: calendarMonth(Math.max(1, c.month), S.pub.startCalendarMonth),
    });
    // 閉じたら、月が変わっても閉じたまま
    const open = $('note').querySelector('details')?.open ?? true;
    $('note').innerHTML = `<details ${open ? 'open' : ''}><summary><strong>🗣 いま話すこと：${esc(n.title)}</strong> <span class="muted">（目安 ${esc(n.time)}）</span></summary>
      <ul>${n.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></details>`;
  }

  function bindRelease() {
    main.querySelectorAll<HTMLButtonElement>('button[data-release]').forEach((b) => b.addEventListener('click', async () => {
      const name = S.teams[b.dataset.release!]?.name ?? '';
      if (confirm(`${name} の参加を解除しますか？\n別の端末からこのチームに参加し直せるようになります。`)) {
        await releaseTeam(db, code, b.dataset.release!);
      }
    }));
  }

  // 画面の作り直しは、表示に関わる値が変わったときだけ（ボタンの押し間違いを防ぐ）
  function update() {
    const c = S.clock;
    const key = JSON.stringify([S.meta?.gmUid ?? S.meta, c?.phase, c?.month, c?.message, S.teams, S.submitted,
      S.results.length, S.budget, Object.keys(S.state).length, c?.phase === 'final' ? S.state : null]);
    if (key === lastKey) return;
    lastKey = key;
    render();
  }

  // ---- 受け取り ----
  let hiddenUnsub: (() => void) | null = null;
  let submittedUnsub: (() => void) | null = null;
  let followedMonth = -1;
  unsubs.push(
    watchServerOffset(db, (o) => { S.offset = o; }),
    watchMeta(db, code, (v) => { S.meta = v; update(); }),
    watchPublic(db, code, (v) => { S.pub = v; update(); }),
    watchTeams(db, code, (v) => { S.teams = v; update(); }),
    watchState(db, code, (v) => { S.state = v; update(); }),
    watchResults(db, code, (v) => { S.results = v; update(); }),
    watchClock(db, code, (v) => {
      S.clock = v;
      if (v && v.month !== followedMonth) {
        followedMonth = v.month;
        hiddenUnsub?.(); submittedUnsub?.();
        S.budget = null; S.submitted = {};
        hiddenUnsub = watchHidden(db, code, v.month, (h) => { S.budget = h?.marketBudget ?? null; update(); });
        submittedUnsub = watchSubmitted(db, code, v.month, (s) => { S.submitted = s; update(); });
      }
      update();
    }),
    () => { hiddenUnsub?.(); submittedUnsub?.(); },
  );
  readPath<{ timer: TimerSettings }>(db, `games/${code}/settings`).then((s) => { S.timer = s?.timer ?? null; });

  return cleanup;
}
