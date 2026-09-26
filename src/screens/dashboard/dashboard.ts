// 全体表示（プロジェクター・画面共有用）。読み取り専用。
// 待機：ゲームコードと参加用 QR ／ 入力中：月・お知らせ・残り時間・提出状況 ／ 結果：表と資金の推移 ／ 期末：順位

import QRCode from 'qrcode';
import type { MonthResult, TeamState } from '../../engine/types';
import { signInAsTeam, waitForAuth } from '../../sync/auth';
import { firebase } from '../../sync/firebase';
import { sortedTeams } from '../../sync/game';
import type { Clock, PublicConfig, TeamSlot } from '../../sync/schema';
import {
  watchClock, watchPublic, watchResults, watchServerOffset, watchState, watchSubmitted, watchTeams,
} from '../../sync/watch';
import { calendarMonth, esc, mmss, monthLabel, secondsLeft, signedYen, yen } from '../../ui/format';
import { legendHtml, lineChartSvg, MAX_SERIES, type Series } from '../../ui/line-chart';

export async function renderDashboard(root: HTMLElement, params: URLSearchParams): Promise<() => void> {
  const code = (params.get('code') ?? '').trim().toUpperCase();
  if (!code) {
    root.innerHTML = '<div class="page"><div class="card">URL にゲームコードがありません（#/screen?code=XXXXXX）。</div></div>';
    return () => {};
  }
  const { auth, db } = firebase('screen');
  await waitForAuth(auth);
  await signInAsTeam(auth); // 読み取りにはログインが必要（匿名で読むだけ）

  const S = {
    pub: undefined as PublicConfig | null | undefined,
    clock: null as Clock | null,
    teams: {} as Record<string, TeamSlot>,
    state: {} as Record<string, TeamState>,
    results: [] as MonthResult[],
    submitted: {} as Record<string, true>,
    offset: 0,
  };
  const teamUrl = `${location.origin}${location.pathname}#/team?code=${code}`;
  const qrSvg = await QRCode.toString(teamUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });

  root.innerHTML = `<div class="screen">
    <header class="screen-head">
      <span class="screen-title">🍋 レモネードスタンド</span>
      <span class="screen-month" id="month"></span>
      <span class="screen-timer" id="timer"></span>
    </header>
    <main id="main"></main></div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const main = $('main');

  let lastKey = '';
  function render() {
    if (S.pub === null) { main.innerHTML = `<p class="screen-big">ゲーム ${esc(code)} は見つかりません。</p>`; return; }
    const c = S.clock;
    if (!S.pub || !c) return;
    const key = JSON.stringify([c.phase, c.month, c.message, S.teams, S.submitted, S.results.length, c.phase === 'final' ? S.state : 0]);
    if (key === lastKey) return;
    lastKey = key;
    $('month').textContent = c.month > 0 ? monthLabel(c.month, S.pub.startCalendarMonth) : '';
    const slots = sortedTeams(S.teams);
    if (c.phase === 'lobby') renderLobby(slots);
    else if (c.phase === 'input') renderInput(c, slots);
    else if (c.phase === 'result') renderResult(c, slots);
    else renderFinal(slots);
  }

  function renderLobby(slots: { teamId: string; slot: TeamSlot }[]) {
    main.innerHTML = `<div class="screen-lobby">
      <div class="screen-join">
        <div class="qr">${qrSvg}</div>
        <div>
          <p class="screen-label">スマホで QR コードを読み取るか、<br>ゲームコードを入れてチームを選んでね</p>
          <p class="screen-code">${esc(code)}</p>
        </div>
      </div>
      <div class="screen-teams">${slots.map(({ slot }) =>
        `<div class="team-tile ${slot.uid ? 'on' : ''}">${slot.uid ? '✅' : '⏳'} ${esc(slot.name)}</div>`).join('')}</div>
    </div>`;
  }

  function renderInput(c: Clock, slots: { teamId: string; slot: TeamSlot }[]) {
    const done = slots.filter((s) => S.submitted[s.teamId]).length;
    main.innerHTML = `
      ${c.message ? `<div class="screen-news">📰 ${esc(c.message)}</div>` : ''}
      <div class="screen-prices">
        <span>🍋 レモン ${yen(c.prices.lemon)}</span><span>🍬 砂糖 ${yen(c.prices.sugar)}</span>
        <span>👩‍🍳 バリスタ ${yen(c.prices.barista)}</span>
      </div>
      ${c.quarterStart && S.pub?.baristaCadence !== 'monthly' ? '<p class="screen-label center">今月はバリスタの人数を決める月です</p>' : ''}
      <p class="screen-label center">提出したチーム ${done} / ${slots.length}</p>
      <div class="screen-teams">${slots.map(({ teamId, slot }) =>
        `<div class="team-tile ${S.submitted[teamId] ? 'on' : ''}">${S.submitted[teamId] ? '✅' : '✏️'} ${esc(slot.name)}</div>`).join('')}</div>`;
  }

  function balanceChart(slots: { teamId: string; slot: TeamSlot }[]): string {
    if (!S.pub || slots.length > MAX_SERIES || S.results.length === 0) return '';
    const start = S.pub.startFund;
    const series: Series[] = slots.map(({ teamId, slot }, i) => ({
      name: slot.name,
      slot: i,
      values: [start, ...S.results.map((r) => r.teamResults.find((t) => t.teamId === teamId)?.balance ?? start)],
    }));
    const xLabels = ['はじめ', ...S.results.map((r) => `${calendarMonth(r.month, S.pub!.startCalendarMonth)}月`)];
    return `<div class="card"><h2>お金の残りの推移</h2>${legendHtml(series)}
      ${lineChartSvg({ series, xLabels, formatY: (v) => (v === 0 ? '0円' : `${(v / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円`) })}</div>`;
  }

  function renderResult(c: Clock, slots: { teamId: string; slot: TeamSlot }[]) {
    const result = S.results.find((r) => r.month === c.month);
    if (!result) { main.innerHTML = '<p class="screen-big">集計中…</p>'; return; }
    const byId = new Map(result.teamResults.map((r) => [r.teamId, r]));
    main.innerHTML = `<div class="screen-result">
      <div class="card">
        <h2>${c.month}か月目の結果</h2>
        <p class="screen-label">お客さんが使えたお金 ${yen(result.marketBudget)}　→　実際に使ったお金 ${yen(result.teamResults.reduce((a, r) => a + r.revenue, 0))}</p>
        <table class="table screen-table">
          <tr><th>チーム</th><th>値段</th><th>売れた数</th><th>もうけ</th><th>お金の残り</th></tr>
          ${slots.map(({ teamId, slot }) => {
            const r = byId.get(teamId);
            if (!r) return '';
            return `<tr><td>${esc(slot.name)}</td><td>${r.offered === 0 ? '静観' : yen(r.price)}</td>
              <td>${r.sold} / ${r.offered}杯</td>
              <td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td><td>${yen(r.balance)}</td></tr>`;
          }).join('')}
        </table>
      </div>
      ${balanceChart(slots)}
    </div>`;
  }

  function renderFinal(slots: { teamId: string; slot: TeamSlot }[]) {
    const names = new Map(slots.map((s) => [s.teamId, s.slot.name]));
    const ranked = Object.values(S.state).sort((a, b) => b.balance - a.balance);
    main.innerHTML = `<div class="screen-result">
      <div class="card">
        <h2>🏆 1年間の結果</h2>
        <table class="table screen-table">
          <tr><th>順位</th><th>チーム</th><th>お金の残り</th><th>1年のもうけ</th></tr>
          ${ranked.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(names.get(t.teamId) ?? t.teamId)}</td>
            <td>${yen(t.balance)}</td><td class="${t.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(t.totalProfit)}</td></tr>`).join('')}
        </table>
      </div>
      ${balanceChart(slots)}
    </div>`;
  }

  const tick = setInterval(() => {
    const c = S.clock;
    const t = $('timer');
    if (c?.phase === 'input') {
      const left = secondsLeft(c.deadlineAt, Date.now() + S.offset);
      t.textContent = left > 0 ? mmss(left) : '締切！';
      t.classList.toggle('urgent', left <= 15);
    } else t.textContent = '';
  }, 250);

  let submittedUnsub: (() => void) | null = null;
  let followed = -1;
  const unsubs = [
    watchServerOffset(db, (o) => { S.offset = o; }),
    watchPublic(db, code, (v) => { S.pub = v; render(); }),
    watchTeams(db, code, (v) => { S.teams = v; render(); }),
    watchState(db, code, (v) => { S.state = v; render(); }),
    watchResults(db, code, (v) => { S.results = v; render(); }),
    watchClock(db, code, (v) => {
      S.clock = v;
      if (v && v.month !== followed) {
        followed = v.month;
        submittedUnsub?.();
        S.submitted = {};
        submittedUnsub = watchSubmitted(db, code, v.month, (s) => { S.submitted = s; render(); });
      }
      render();
    }),
  ];
  return () => {
    clearInterval(tick);
    unsubs.forEach((u) => u());
    submittedUnsub?.();
  };
}
