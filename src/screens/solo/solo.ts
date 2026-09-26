// ソロモード（#/solo）：人1チーム vs CPU 3チーム。ブラウザの中だけで12か月遊ぶ（Firebase は使わない）。
// 入力画面と結果画面は販売チーム画面のものを使う。

import { CPU_TYPE_INFO } from '../../engine/cpu-teams';
import { SCENARIOS } from '../../engine/scenarios';
import type { CostMode, ScenarioId } from '../../engine/types';
import {
  clearSolo, HUMAN_ID, lastHumanDecision, loadSolo, newSoloGame, nextSoloMonth, saveSolo, SOLO_DIFFICULTY, submitHuman,
  type SoloDifficulty, type SoloState,
} from '../../solo/local-game';
import { monthKey, publicConfigOf, type Clock, type TeamSlot } from '../../sync/schema';
import { esc, monthLabel, yen } from '../../ui/format';
import { DEFAULT_DECISION, mountInputView } from '../team/input-view';
import { renderFinal, renderMonthResult } from '../team/result-view';

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

  function renderStart(saved: SoloState | null) {
    root.innerHTML = `<div class="page">
      <h1>🍋 ひとりで練習（ソロモード）</h1>
      <div class="card">
        <p>CPU の3つのお店と、1年間（12か月）もうけを競います。お客さんの数はゲームごとにちがいます。毎月の結果から読み取りましょう。<br>
        それぞれのお店には<strong>作戦</strong>があります。どんな作戦か、結果から読み取ってみましょう。答えは1年の最後に発表します。</p>
        <p class="muted">このモードはこの端末の中だけで動きます。途中の状態はこのブラウザに保存されます。</p>
      </div>
      ${saved ? `<div class="card">
        <h2>続きがあります</h2>
        <p>${saved.difficulty ? `むずかしさ：${esc(SOLO_DIFFICULTY[saved.difficulty].label)}。` : ''}${saved.phase === 'final' ? '1年の結果が出ています。' : `${monthLabel(saved.conditions.month, saved.config.startCalendarMonth)}まで進んでいます。`}</p>
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
        <label class="field">1年の市場の流れ（シナリオ）
          <select id="scenario">
            <option value="none">なし（毎月少しずつ変わる）</option>
            ${Object.entries(SCENARIOS).map(([id, sc]) => `<option value="${id}">${esc(sc.name)}</option>`).join('')}
          </select></label>
        <label class="field">材料の値段の変わり方（シナリオなしのとき）
          <select id="costMode">
            <option value="fixed">変わらない</option>
            <option value="random">毎月ランダムに変わる</option>
            <option value="trend">だんだん上がる</option>
            <option value="shock">ときどき大きく変わる</option>
          </select></label>
        <button class="btn ${saved ? 'secondary' : ''}" id="start">${saved ? '最初からやり直す' : 'はじめる'}</button>
      </div>
      <p class="center"><a href="#/">トップにもどる</a></p></div>`;

    root.querySelector('#resume')?.addEventListener('click', () => { state = saved; renderGame(); });
    root.querySelector('#start')!.addEventListener('click', () => {
      if (saved && !confirm('いまの続きを消して、最初からやり直しますか？')) return;
      clearSolo();
      const s = newSoloGame({
        seed: `solo-${Date.now()}`,
        scenario: root.querySelector<HTMLSelectElement>('#scenario')!.value as ScenarioId,
        costMode: root.querySelector<HTMLSelectElement>('#costMode')!.value as CostMode,
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
      <div id="view"></div>
      <p class="center muted" style="margin-top:24px"><a href="#" id="quit">やめる（途中は保存されています）</a></p></div>`;
    root.querySelector('#quit')!.addEventListener('click', (e) => { e.preventDefault(); renderStart(loadSolo()); });
    const view = root.querySelector<HTMLElement>('#view')!;

    if (s.phase === 'input') {
      const clock: Clock = {
        month, monthKey: monthKey(month), phase: 'input', deadlineAt: 0, quarterStart: (month - 1) % 3 === 0,
        prices: s.conditions.prices, ...(s.conditions.message ? { message: s.conditions.message } : {}),
      };
      mountInputView(
        view,
        { pub: publicConfigOf(s.config), clock, me, ownSub: null, closed: false },
        { decision: lastHumanDecision(s) ?? DEFAULT_DECISION, baristaCount: me.baristaCount },
        async (decision, baristaCount) => update(submitHuman(s, decision, baristaCount)),
        { submitLabel: 'この決定で1か月すすめる' },
      );
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

    // 期末：順位と、CPU の作戦の答え合わせ
    renderFinal(view, Object.fromEntries(s.teams.map((t) => [t.teamId, t])), HUMAN_ID, slotsOf(s));
    const reveal = document.createElement('div');
    reveal.innerHTML = `<div class="card">
        <h2>答え合わせ：CPU のお店の作戦</h2>
        <table class="table">${Object.entries(s.cpu).map(([id, type]) => `<tr>
          <td>${esc(s.names[id] ?? id)}</td>
          <td style="text-align:left"><strong>${esc(CPU_TYPE_INFO[type].label)}</strong><br>
            <span class="muted">${esc(CPU_TYPE_INFO[type].description)}</span></td></tr>`).join('')}</table>
        <p class="muted">あなたの作戦は、どのお店に近かったでしょうか。どの月にもうけが増えたか、減ったかも振り返ってみましょう。</p>
      </div>
      <button class="btn" id="again">もう一度あそぶ</button>`;
    view.appendChild(reveal);
    reveal.querySelector('#again')!.addEventListener('click', () => { clearSolo(); state = null; renderStart(null); });
  }

  return () => {};
}
