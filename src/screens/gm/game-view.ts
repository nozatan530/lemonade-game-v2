// GM の進行画面：待機 → 入力（タイマー・提出状況・締切）→ 結果 → 次の月 → 期末 → 削除

import QRCode from 'qrcode';
import { renderGmFinal, renderGmYearEnd } from '../report/multi';
import { isYearEnd, yearOf } from '../../engine/years';
import { gmNote } from './facilitation';
import type { Database } from 'firebase/database';
import type { MonthResult, TeamState, TimerSettings } from '../../engine/types';
import {
  closeCurrentMonth, deleteGame, extendDeadline, readPath, releaseTeam, restartGame, shouldAutoClose, sortedTeams,
  endGameEarly, setMonthPrices, startGame, startNextMonth,
} from '../../sync/game';
import type { Clock, GameMeta, PublicConfig, SubmissionDoc, TeamSlot } from '../../sync/schema';
import { openOnOtherScreen } from '../../ui/present';
import {
  watchClock, watchHidden, watchMonthSubs, watchMeta, watchPublic, watchResults, watchServerOffset, watchState, watchSubmitted,
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
    subs: {} as Record<string, SubmissionDoc>, // 提出の中身（GM の手元だけ）
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
        <p style="margin:8px 0 0"><button class="btn secondary" id="openScreen" type="button" style="width:auto">📺 全体表示をもう1つの画面に開く</button></p>
        <p class="muted" id="openScreenMsg" style="margin:4px 0 0">プロジェクターや大きな画面を「拡張」でつないでから押すと、そちらの画面に開きます。開いた画面の「全画面にする」を押せば準備完了です。</p>
      </div>
      <div class="qr" id="qr" title="チームの参加用 QR コード"></div>
    </div>
    <div class="card gm-note" id="note"></div>
    <div id="main"></div>
    <div class="card" id="priceCard" hidden>
      <h2>今月の単価を変える</h2>
      <p class="muted">材料の値上がり・値下がりを演出したいときに。チームの画面にもすぐ反映され、今月の集計はこの単価で行います。</p>
      <div class="price-edit">
        <label>🍋 レモン1個 <input type="number" id="pLemon" min="1" step="1"> 円</label>
        <label>🍬 砂糖1袋 <input type="number" id="pSugar" min="1" step="1"> 円</label>
        <label>👩‍🍳 バリスタ1人 <input type="number" id="pBarista" min="1" step="100"> 円</label>
      </div>
      <button class="btn secondary" id="pApply" type="button" style="width:auto">この単価にする</button>
      <span class="muted" id="pMsg"></span>
    </div>
    <div class="card" id="endEarlyCard" hidden>
      <h2>ここで終わる</h2>
      <p class="muted">授業の時間が足りないときに。結果が出た月までで期末にして、全チームに期末の結果を見せます（入力中の月は数えません）。データは消えません。</p>
      <button class="btn secondary" id="endEarly" type="button">ここで終わる（そこまでの結果を見る）</button>
    </div>
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

  $('openScreen').addEventListener('click', async () => {
    $('openScreenMsg').textContent = '開いています…（画面の配置の許可を聞かれたら「許可」を押してください）';
    const r = await openOnOtherScreen(screenUrl);
    $('openScreenMsg').textContent = r === 'other'
      ? 'もう1つの画面に開きました。そちらの「全画面にする」を押してください。'
      : r === 'window'
        ? '新しいウィンドウで開きました。プロジェクターの画面へドラッグして、「全画面にする」を押してください（Chrome・Edge では、画面の配置の許可をすると次から自動で移ります）。'
        : 'ウィンドウを開けませんでした。ブラウザのポップアップの許可を確認してください。';
  });

  // 今月の単価（月が変わったときだけ入力欄に入れる。入力中に上書きしない）
  let priceMonth = -1;
  function syncPriceCard(c: Clock) {
    const show = c.phase === 'input';
    $('priceCard').hidden = !show;
    if (!show || priceMonth === c.month) return;
    priceMonth = c.month;
    ($('pLemon') as HTMLInputElement).value = String(c.prices.lemon);
    ($('pSugar') as HTMLInputElement).value = String(c.prices.sugar);
    ($('pBarista') as HTMLInputElement).value = String(c.prices.barista);
    $('pMsg').textContent = '';
  }
  $('pApply').addEventListener('click', async (e) => {
    const num = (id: string) => Number(($(id) as HTMLInputElement).value);
    const prices = { lemon: num('pLemon'), sugar: num('pSugar'), barista: num('pBarista') };
    const sent = Object.keys(S.subs).length;
    if (sent > 0 && !confirm(`もう${sent}チームが提出しています。単価を変えると、その決定のまま新しい単価で集計します。変えますか？`)) return;
    (e.target as HTMLButtonElement).disabled = true;
    try {
      $('pMsg').textContent = (await setMonthPrices(db, code, prices)) === 'ok' ? '　変えました。' : '　入力中の月だけ変えられます。';
    } catch (err) {
      $('pMsg').textContent = `　${(err as Error).message}`;
    } finally {
      (e.target as HTMLButtonElement).disabled = false;
    }
  });

  $('endEarly').addEventListener('click', async (e) => {
    const done = S.results.length;
    if (!confirm(`ここでゲームを終わりにしますか？\n${done}か月目までの結果で期末にします。`)) return;
    (e.target as HTMLButtonElement).disabled = true;
    try {
      await endGameEarly(db, code);
    } catch (err) {
      alert(`終われませんでした：${(err as Error).message}`);
    } finally {
      (e.target as HTMLButtonElement).disabled = false;
    }
  });
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
    $('month').textContent = c.month > 0 ? monthLabel(c.month, S.pub.startCalendarMonth, S.pub.months) : '開始前';
    syncPriceCard(c);
    $('endEarlyCard').hidden = !['input', 'result', 'yearEnd'].includes(c.phase) || S.results.length < 1;

    renderNote(c);
    const slots = sortedTeams(S.teams);
    if (c.phase === 'lobby') return renderLobby(slots);
    if (c.phase === 'input') return renderInput(c, slots);
    if (c.phase === 'result') return renderResult(c, slots);
    if (c.phase === 'yearEnd') return renderYearEnd(c);
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
        <td>${subSummary(S.subs[teamId])}</td>
        <td>${slot.uid ? `<button class="small" data-release="${teamId}">解除</button>` : ''}</td></tr>`).join('')}</table>
      <p class="muted">提出の中身（値段・仕入れ）は GM の画面だけに出ます。全体表示やチームには出ません。<br>
        締切までに提出しなかったチームは、先月と同じ決定で進みます（1か月目は静観）。</p>
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
      <h2>${monthLabel(c.month, S.pub!.startCalendarMonth, S.pub!.months)}の結果</h2>
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
      <button class="btn" id="next">${isLast ? '期末の結果へ' : isYearEnd(c.month) ? `第${yearOf(c.month)}期の決算へ` : '次の月へ'}</button></div>`;
    main.querySelector('#next')!.addEventListener('click', async (e) => {
      (e.target as HTMLButtonElement).disabled = true;
      await startNextMonth(db, code, serverNow());
    });
  }

  // 年の決算（2年以上のとき、12か月ごと）：その年の一覧と、次の年へ進むボタン
  function renderYearEnd(c: Clock) {
    if (!S.pub) return;
    const year = yearOf(c.month);
    renderGmYearEnd(main, { results: S.results, state: S.state, teams: S.teams, pub: S.pub }, year);
    main.insertAdjacentHTML('beforeend', `<button class="btn" id="nextYear" type="button">第${year + 1}期を始める</button>`);
    main.querySelector('#nextYear')!.addEventListener('click', async (e) => {
      (e.target as HTMLButtonElement).disabled = true;
      await startNextMonth(db, code, serverNow());
    });
  }

  function renderFinal() {
    if (!S.pub) return;
    renderGmFinal(main, { results: S.results, state: S.state, teams: S.teams, pub: S.pub });
    main.insertAdjacentHTML('beforeend', `<div class="card">
        <h2>次のゲーム</h2>
        <p class="muted">同じゲームコード・同じチームのまま、新しいゲームを始められます（市場の動きは変わります）。チームは参加したままなので、そのまま1か月目に進めます。このゲームの結果は消えるので、レポートの印刷を先にすませてください。</p>
        <button class="btn" id="restart" type="button">同じコード・同じチームで次のゲームを始める</button>
      </div>
      <p class="muted">終わるときは、下の「ゲームを終了してデータを削除」でデータを消してください。チームの画面には「ゲームは終了しました」と出ます。</p>`);
    main.querySelector('#restart')!.addEventListener('click', async (e) => {
      if (!confirm('このゲームの結果を消して、同じコード・同じチームで次のゲームを始めますか？\nレポートの印刷はすみましたか？')) return;
      (e.target as HTMLButtonElement).disabled = true;
      try {
        await restartGame(db, code, serverNow());
      } catch (err) {
        alert(`次のゲームを始められませんでした：${(err as Error).message}`);
        (e.target as HTMLButtonElement).disabled = false;
      }
    });
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
    const key = JSON.stringify([S.meta?.gmUid ?? S.meta, c?.phase, c?.month, c?.message, S.teams, S.submitted, S.subs,
      S.results.length, S.budget, Object.keys(S.state).length, c?.phase === 'final' ? S.state : null]);
    if (key === lastKey) return;
    lastKey = key;
    render();
  }

  // ---- 受け取り ----
  let hiddenUnsub: (() => void) | null = null;
  let submittedUnsub: (() => void) | null = null;
  let subsUnsub: (() => void) | null = null;
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
        hiddenUnsub?.(); submittedUnsub?.(); subsUnsub?.();
        S.budget = null; S.submitted = {}; S.subs = {};
        subsUnsub = watchMonthSubs(db, code, v.month, (x) => { S.subs = x; update(); });
        hiddenUnsub = watchHidden(db, code, v.month, (h) => { S.budget = h?.marketBudget ?? null; update(); });
        submittedUnsub = watchSubmitted(db, code, v.month, (s) => { S.submitted = s; update(); });
      }
      update();
    }),
    () => { hiddenUnsub?.(); submittedUnsub?.(); subsUnsub?.(); },
  );
  readPath<{ timer: TimerSettings }>(db, `games/${code}/settings`).then((s) => { S.timer = s?.timer ?? null; });

  return cleanup;
}

// 提出の中身を短く（GM の表だけで使う）
function subSummary(sub: SubmissionDoc | undefined): string {
  if (!sub) return '';
  const d = sub.monthlyDecision;
  if (d.watching) return '<span class="muted">静観</span>';
  const barista = sub.quarterlyDecision?.baristaCount;
  return `<strong>${yen(d.price)}</strong> <span class="muted">🍋${d.lemonQty} 🍬${d.sugarQty}${barista !== undefined ? ` 👩‍🍳${barista}人` : ''}</span>`;
}
