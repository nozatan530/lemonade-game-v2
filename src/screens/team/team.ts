// 販売チーム画面（スマホ優先）。参加 → 待機 → 毎月の入力 → 結果 → 期末。

import type { MonthlyDecision, MonthResult, TeamState } from '../../engine/types';
import { signInAsTeam, waitForAuth } from '../../sync/auth';
import { firebase } from '../../sync/firebase';
import { claimTeam, readPath, sortedTeams, submitDecision } from '../../sync/game';
import { monthKey, type Clock, type PublicConfig, type SubmissionDoc, type TeamSlot } from '../../sync/schema';
import {
  watchClock, watchOwnSubmission, watchPublic, watchResults, watchServerOffset, watchState, watchTeams,
} from '../../sync/watch';
import { esc, mmss, monthLabel, secondsLeft, yen } from '../../ui/format';
import { DEFAULT_DECISION, mountInputView, type InputView } from './input-view';
import { renderFinal, renderMonthResult } from './result-view';

export async function renderTeam(root: HTMLElement, params: URLSearchParams): Promise<void> {
  const code = (params.get('code') ?? '').trim().toUpperCase();
  if (!code) {
    renderCodeEntry(root);
    return;
  }

  root.innerHTML = '<div class="page"><p class="muted">読み込み中…</p></div>';
  // 開発中だけ、device で別の端末のふりができる
  const device = import.meta.env.VITE_USE_EMULATOR === 'true' ? (params.get('device') ?? '') : '';
  const { auth, db } = firebase('team', device);
  await waitForAuth(auth);
  const user = await signInAsTeam(auth);

  const S = {
    pub: undefined as PublicConfig | null | undefined,
    clock: null as Clock | null,
    teams: {} as Record<string, TeamSlot>,
    state: {} as Record<string, TeamState>,
    results: [] as MonthResult[],
    offset: 0,
    ownSub: null as SubmissionDoc | null,
  };

  root.innerHTML = `<div class="page">
    <div class="topbar"><span class="team" id="teamname">🍋</span><span class="muted" id="month"></span><span class="timer" id="timer"></span></div>
    <div id="view"></div></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const view = $('view');

  let viewKey = '';
  let inputView: InputView | null = null;
  let unsubOwn: (() => void) | null = null;
  let ownSubKey = '';

  const myTeamId = () => Object.entries(S.teams).find(([, t]) => t.uid === user.uid)?.[0] ?? null;
  const serverNow = () => Date.now() + S.offset;
  const isClosed = () => !!S.clock && S.clock.phase === 'input' && secondsLeft(S.clock.deadlineAt, serverNow()) === 0;

  // 今月の自分の提出を受け取る（出し直しや、読み込み直しに対応）
  function followOwnSubmission(teamId: string, month: number) {
    const key = `${teamId}-${month}`;
    if (key === ownSubKey) return;
    ownSubKey = key;
    unsubOwn?.();
    S.ownSub = null;
    unsubOwn = watchOwnSubmission(db, code, month, teamId, (s) => { S.ownSub = s; render(); });
  }

  // 入力欄の初期値：今月の提出 → 先月の自分の提出 → 先月の結果 → 既定値
  async function startValues(teamId: string, month: number, me: TeamState) {
    const current = S.ownSub ?? await readPath<SubmissionDoc>(db, `games/${code}/subs/${monthKey(month)}/${teamId}`).catch(() => null);
    const prev = current ?? await readPath<SubmissionDoc>(db, `games/${code}/subs/${monthKey(month - 1)}/${teamId}`).catch(() => null);
    let decision: MonthlyDecision = DEFAULT_DECISION;
    if (prev) decision = prev.monthlyDecision;
    else {
      const last = S.results.find((r) => r.month === month - 1)?.teamResults.find((t) => t.teamId === teamId);
      if (last && last.offered > 0) decision = { lemonQty: last.lemonBought, sugarQty: last.sugarBought, price: last.price };
    }
    const baristaCount = current?.quarterlyDecision?.baristaCount ?? me.baristaCount;
    return { decision, baristaCount };
  }

  let mounting = false;
  async function render() {
    if (S.pub === null) {
      view.innerHTML = `<div class="card">ゲームコード「${esc(code)}」のゲームが見つかりません。<br><a href="#/team">コードを入れ直す</a></div>`;
      return;
    }
    if (!S.pub || !S.clock) return;
    const clock = S.clock;
    const teamId = myTeamId();
    $('teamname').textContent = teamId ? `🍋 ${S.teams[teamId]!.name}` : '🍋 レモネードスタンド';
    $('month').textContent = clock.month > 0 ? monthLabel(clock.month, S.pub.startCalendarMonth) : '';

    if (!teamId) {
      viewKey = 'join';
      inputView = null;
      renderJoin();
      return;
    }
    const me = S.state[teamId];

    if (clock.phase === 'lobby') {
      if (viewKey !== 'lobby') {
        viewKey = 'lobby';
        view.innerHTML = `<div class="card center">
          <h2>${esc(S.teams[teamId]!.name)}で参加しました</h2>
          <p>GMがゲームを始めるまで待ってください。</p></div>
          ${howToPlay(S.pub)}`;
      }
      return;
    }

    if (clock.phase === 'input' && me) {
      followOwnSubmission(teamId, clock.month);
      const key = `input-${clock.month}-${teamId}`;
      const ctx = { pub: S.pub, clock, me, ownSub: S.ownSub, closed: isClosed() };
      if (viewKey === key && inputView) {
        inputView.update(ctx);
        return;
      }
      if (mounting) return;
      mounting = true;
      const values = await startValues(teamId, clock.month, me);
      mounting = false;
      if (S.clock?.month !== clock.month || S.clock.phase !== 'input') return render();
      viewKey = key;
      inputView = mountInputView(view, { ...ctx, ownSub: S.ownSub }, values, async (decision, baristaCount) => {
        await submitDecision(db, code, clock.month, teamId, decision,
          baristaCount !== undefined ? { baristaCount } : undefined);
      });
      return;
    }

    inputView = null;
    if (clock.phase === 'result') {
      const result = S.results.find((r) => r.month === clock.month);
      const key = `result-${clock.month}-${!!result}`;
      if (viewKey === key) return;
      viewKey = key;
      if (!result) {
        view.innerHTML = '<div class="card center">集計中…</div>';
        return;
      }
      renderMonthResult(view, result, teamId, S.teams);
      return;
    }

    if (clock.phase === 'final') {
      viewKey = 'final';
      renderFinal(view, S.state, teamId, S.teams);
    }
  }

  function renderJoin() {
    const slots = sortedTeams(S.teams);
    view.innerHTML = `<div class="card">
      <h2>チームを選んで参加</h2>
      <p class="muted">ゲームコード：${esc(code)}</p>
      ${slots.map(({ teamId, slot }) => `<button class="btn ${slot.uid ? 'secondary' : ''}" data-team="${esc(teamId)}" ${slot.uid ? 'disabled' : ''}>
        ${esc(slot.name)}${slot.uid ? '（参加済み）' : ''}</button>`).join('')}
      <p class="muted" style="margin-top:12px">名前など個人の情報は入力しません。チーム名だけで参加します。</p>
    </div>`;
    view.querySelectorAll<HTMLButtonElement>('button[data-team]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await claimTeam(db, code, b.dataset.team!, user.uid);
        } catch {
          alert('このチームには、ほかの端末がすでに参加しています。GMに確認してください。');
        }
      });
    });
  }

  // 残り時間の表示（締切になったら入力を止める）
  setInterval(() => {
    const c = S.clock;
    const t = $('timer');
    if (!c || c.phase !== 'input') { t.textContent = ''; return; }
    const left = secondsLeft(c.deadlineAt, serverNow());
    t.textContent = `⏱ ${mmss(left)}`;
    t.classList.toggle('urgent', left <= 15);
    if (left === 0 && inputView) render();
  }, 250);

  watchServerOffset(db, (o) => { S.offset = o; });
  watchPublic(db, code, (v) => { S.pub = v; render(); });
  watchClock(db, code, (v) => { S.clock = v; render(); });
  watchTeams(db, code, (v) => { S.teams = v; render(); });
  watchState(db, code, (v) => { S.state = v; render(); });
  watchResults(db, code, (v) => { S.results = v; viewKey = viewKey.startsWith('result') ? '' : viewKey; render(); });
}

function renderCodeEntry(root: HTMLElement) {
  root.innerHTML = `<div class="page">
    <h1>🍋 レモネードスタンド</h1>
    <div class="card">
      <h2>ゲームコードを入れてください</h2>
      <p class="muted">GMが画面に出している6文字のコードです。</p>
      <input id="code" autocomplete="off" autocapitalize="characters" maxlength="6"
        style="width:100%;height:52px;font-size:1.6rem;text-align:center;letter-spacing:.2em;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text)">
      <button class="btn" id="go">参加する</button>
    </div></div>`;
  const input = root.querySelector<HTMLInputElement>('#code')!;
  const go = () => {
    const c = input.value.trim().toUpperCase();
    if (c.length === 6) location.hash = `#/team?code=${c}`;
  };
  root.querySelector('#go')!.addEventListener('click', go);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
}

function howToPlay(pub: PublicConfig): string {
  return `<div class="card">
    <h2>あそびかた</h2>
    <ul style="margin:0;padding-left:1.2em">
      <li>毎月、<strong>レモンと砂糖をいくつ買うか</strong>と、<strong>1杯の値段</strong>を決めます。</li>
      <li>1杯＝レモン${pub.recipe.lemon}個＋砂糖${pub.recipe.sugar}袋。バリスタ1人で1か月に${pub.baristaCapacity}杯まで作れます。</li>
      <li>お客さんは<strong>安いお店から順に</strong>買います。お客さんが使えるお金には限りがあります。</li>
      <li>作って売れ残ったレモネードは捨てます。お店に出さなかった材料は来月に残せます。</li>
      <li>3か月ごとに、バリスタの人数を決めます。給料は毎月かかります。</li>
      <li>はじめのお金は${yen(pub.startFund)}。${pub.months}か月後に一番お金を増やしたチームの勝ち！</li>
    </ul></div>`;
}
