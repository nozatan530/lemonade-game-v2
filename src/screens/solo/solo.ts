// ソロモード（#/solo）：人1チーム vs CPU 3チーム。ブラウザの中だけで12か月遊ぶ（Firebase は使わない）。
// 入力画面と結果画面は販売チーム画面のものを使う。

import { CPU_TYPE_INFO } from '../../engine/cpu-teams';
import { canChangeBarista, MARKET_PATTERNS } from '../../engine/config';
import type { MarketPattern } from '../../engine/types';
import {
  clearSolo, HUMAN_ID, lastHumanDecision, loadSolo, newSoloGame, nextSoloMonth, saveSolo, SOLO_DIFFICULTY, submitHuman,
  type SoloDifficulty, type SoloState,
} from '../../solo/local-game';
import { monthKey, publicConfigOf, type Clock, type TeamSlot } from '../../sync/schema';
import { esc, monthLabel, yen } from '../../ui/format';
import { maybeStartInputCoach } from '../team/input-coach';
import { DEFAULT_DECISION, mountInputView } from '../team/input-view';
import { renderMonthResult } from '../team/result-view';
import { renderTermReport } from '../report/report';
import { mountSurveyForm } from '../survey/survey-form';

export function renderSolo(root: HTMLElement): () => void {
  let state: SoloState | null = null;

  const saved = loadSolo();
  if (saved) renderStart(saved);
  else renderStart(null);

  function update(next: SoloState) {
    state = next;
    saveSolo(next);
    // 入力画面が提出ボタンの後始末を終えてから、画面を切り替える
    setTimeout(() => { renderGame(); window.scrollTo(0, 0); }, 0);
  }

  function renderStart(saved: SoloState | null, prev?: { difficulty: SoloDifficulty; pattern: MarketPattern }) {
    root.innerHTML = `<div class="page">
      <h1>🍋 ひとりで練習（ソロモード）</h1>
      <div class="card">
        <p>🤖 ロボット店長が決めている3つのお店と、1年間（12か月）もうけを競います。お客さんの数はゲームごとにちがいます。毎月の結果から読み取りましょう。<br>
        ロボット店長には、それぞれ<strong>作戦</strong>があります。どんな作戦か、結果から読み取ってみましょう。答えは1年の最後に発表します。</p>
        <p class="muted">このモードはこの端末の中だけで動きます。途中の状態はこのブラウザに保存されます。はじめての人は<a href="#/guide">「はじめに」</a>を読んでね。</p>
      </div>
      ${saved ? `<div class="card">
        <h2>続きがあります</h2>
        <p>${saved.difficulty ? `むずかしさ：${esc(SOLO_DIFFICULTY[saved.difficulty].label)}。` : ''}${saved.config.market.pattern ? `市場：${esc(MARKET_PATTERNS[saved.config.market.pattern].label)}。` : ''}${saved.phase === 'final' ? '1年の結果が出ています。' : `${monthLabel(saved.conditions.month, saved.config.startCalendarMonth)}まで進んでいます。`}</p>
        <button class="btn" id="resume">続きから</button>
      </div>` : ''}
      <div class="card">
        <h2>${saved ? '最初からやり直す' : '新しく始める'}</h2>
        <fieldset class="field"><legend>むずかしさ</legend>
          ${(Object.keys(SOLO_DIFFICULTY) as SoloDifficulty[]).map((d) => `<label class="radio">
            <input type="radio" name="difficulty" value="${d}" ${d === 'normal' ? 'checked' : ''}>
            <span><strong>${esc(SOLO_DIFFICULTY[d].label)}</strong><br><span class="muted">${esc(SOLO_DIFFICULTY[d].description)}</span></span>
          </label>`).join('')}
        </fieldset>
        <fieldset class="field"><legend>市場のパターン（お客さんの数と材料の値段の動き方）</legend>
          ${(Object.keys(MARKET_PATTERNS) as MarketPattern[]).map((p) => `<label class="radio">
            <input type="radio" name="pattern" value="${p}" ${p === 'stable' ? 'checked' : ''}>
            <span><strong>${esc(MARKET_PATTERNS[p].label)}</strong><br><span class="muted">${esc(MARKET_PATTERNS[p].description)}</span></span>
          </label>`).join('')}
        </fieldset>
        <button class="btn ${saved ? 'secondary' : ''}" id="start">${saved ? '最初からやり直す' : 'はじめる'}</button>
      </div>
      <p class="center"><a href="#/">トップにもどる</a></p></div>`;

    if (prev) {
      root.querySelector<HTMLInputElement>(`input[name="difficulty"][value="${prev.difficulty}"]`)!.checked = true;
      root.querySelector<HTMLInputElement>(`input[name="pattern"][value="${prev.pattern}"]`)!.checked = true;
    }
    root.querySelector('#resume')?.addEventListener('click', () => { state = saved; renderGame(); });
    root.querySelector('#start')!.addEventListener('click', () => {
      if (saved && !confirm('いまの続きを消して、最初からやり直しますか？')) return;
      clearSolo();
      const s = newSoloGame({
        seed: `solo-${Date.now()}`,
        pattern: (root.querySelector<HTMLInputElement>('input[name="pattern"]:checked')?.value ?? 'stable') as MarketPattern,
        difficulty: (root.querySelector<HTMLInputElement>('input[name="difficulty"]:checked')?.value ?? 'normal') as SoloDifficulty,
      });
      state = s;
      saveSolo(s);
      renderGame();
    });
  }

  function slotsOf(s: SoloState): Record<string, TeamSlot> {
    return Object.fromEntries(s.teams.map((t, i) => [t.teamId, { name: s.names[t.teamId] ?? t.teamId, order: i }]));
  }

  function renderGame() {
    const s = state;
    if (!s) return;
    const me = s.teams.find((t) => t.teamId === HUMAN_ID)!;
    const month = s.conditions.month;
    root.innerHTML = `<div class="page">
      <div class="topbar"><span class="team">🍋 ${esc(s.names[HUMAN_ID]!)}</span>
        <span class="muted">${monthLabel(month, s.config.startCalendarMonth)}</span>
        <span class="num">${yen(me.balance)}</span></div>
      <div class="game-actions">
        <button type="button" class="small" id="quit">いったんやめる</button>
        <button type="button" class="small" id="reset">最初からやり直す</button>
      </div>
      <div id="view"></div></div>`;
    // いったんやめる：途中は保存されているので、あとで「続きから」遊べる
    root.querySelector('#quit')!.addEventListener('click', () => renderStart(loadSolo()));
    // 最初からやり直す：いまのゲームを消して、開始画面へ（前と同じ設定を選んだ状態にする）
    root.querySelector('#reset')!.addEventListener('click', () => {
      if (!confirm('いまのゲームを消して、最初からやり直しますか？')) return;
      clearSolo();
      state = null;
      renderStart(null, { difficulty: s.difficulty ?? 'normal', pattern: s.config.market.pattern ?? 'stable' });
    });
    const view = root.querySelector<HTMLElement>('#view')!;

    if (s.phase === 'input') {
      const clock: Clock = {
        month, monthKey: monthKey(month), phase: 'input', deadlineAt: 0, quarterStart: canChangeBarista(month, s.config.baristaCadence),
        prices: s.conditions.prices, ...(s.conditions.message ? { message: s.conditions.message } : {}),
      };
      mountInputView(
        view,
        { pub: publicConfigOf(s.config), clock, me, ownSub: null, closed: false },
        { decision: lastHumanDecision(s) ?? DEFAULT_DECISION, baristaCount: me.baristaCount },
        async (decision, baristaCount) => update(submitHuman(s, decision, baristaCount)),
        { submitLabel: 'この決定で1か月すすめる' },
      );
      // 最初の1回だけ、1か月目に手順を案内する
      if (month === 1) maybeStartInputCoach(view, 'この決定で1か月すすめる');
      return;
    }

    if (s.phase === 'result') {
      const result = s.results[s.results.length - 1]!;
      const isLast = month >= s.config.months;
      renderMonthResult(view, result, HUMAN_ID, slotsOf(s), {
        nextLabel: isLast ? '1年の結果を見る' : '次の月へ',
        onNext: () => update(nextSoloMonth(s)),
      });
      return;
    }

    // 期末：1年の振り返りと、CPU の作戦の答え合わせ
    renderTermReport(view, {
      results: s.results, teams: s.teams, names: s.names, meId: HUMAN_ID,
      startFund: s.config.startFund, startCalendarMonth: s.config.startCalendarMonth, recipe: s.config.recipe,
    });
    const reveal = document.createElement('div');
    reveal.innerHTML = `<div class="card">
        <h2>答え合わせ：ロボット店長の作戦</h2>
        <table class="table">${Object.entries(s.cpu).map(([id, type]) => `<tr>
          <td>${esc(s.names[id] ?? id)}</td>
          <td style="text-align:left"><strong>${esc(CPU_TYPE_INFO[type].label)}</strong><br>
            <span class="muted">${esc(CPU_TYPE_INFO[type].description)}</span></td></tr>`).join('')}</table>
        <p class="muted">あなたの作戦は、どのお店に近かったでしょうか。どの月にもうけが増えたか、減ったかも振り返ってみましょう。</p>
      </div>
      <div class="card"><h2>✉️ 感想を聞かせてください（1分）</h2><div id="survey"></div></div>
      <button class="btn" id="again">もう一度あそぶ</button>`;
    view.appendChild(reveal);
    const ranked = [...s.teams].sort((a, b) => b.balance - a.balance);
    mountSurveyForm(reveal.querySelector('#survey')!, {
      source: 'solo-final',
      pattern: s.config.market.pattern,
      difficulty: s.difficulty,
      rank: ranked.findIndex((t) => t.teamId === HUMAN_ID) + 1,
      teams: s.teams.length,
      profit: s.teams.find((t) => t.teamId === HUMAN_ID)!.totalProfit,
    }, `solo-${s.config.market.seed}`);
    reveal.querySelector('#again')!.addEventListener('click', () => { clearSolo(); state = null; renderStart(null); });
  }

  return () => {};
}
