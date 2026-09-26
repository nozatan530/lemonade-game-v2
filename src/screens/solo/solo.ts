// ソロモード（#/solo）：人1チーム vs CPU 3チーム（画面では「ロボット店長」）。ブラウザの中だけで12か月遊ぶ（Firebase は使わない）。
// 入力画面と結果画面は販売チーム画面のものを使う。

import { canChangeBarista, MARKET_PATTERNS } from '../../engine/config';
import type { MarketPattern } from '../../engine/types';
import { t } from '../../i18n';
import { cpuDesc, cpuLabel, difficultyDesc, difficultyLabel, newsText, patternDesc, patternLabel, soloTeamName } from '../../i18n/content';
import {
  clearSolo, HUMAN_ID, lastHumanDecision, loadSolo, newSoloGame, nextSoloMonth, saveSolo, SOLO_DIFFICULTY, submitHuman,
  type SoloDifficulty, type SoloState,
} from '../../solo/local-game';
import { monthKey, publicConfigOf, type Clock, type TeamSlot } from '../../sync/schema';
import { esc, monthLabel, yen } from '../../ui/format';
import { bindLangToggle, langToggleHtml } from '../../ui/lang-toggle';
import { maybeStartInputCoach } from '../team/input-coach';
import { DEFAULT_DECISION, mountInputView } from '../team/input-view';
import { renderMonthResult } from '../team/result-view';
import { renderTermReport } from '../report/report';
import { mountSurveyForm } from '../survey/survey-form';

// resume：言語を切り替えたときなど、保存されたゲームがあればそのまま続きを表示する
export function renderSolo(root: HTMLElement, opts: { resume?: boolean } = {}): () => void {
  let state: SoloState | null = null;

  const saved = loadSolo();
  if (saved && opts.resume) {
    state = saved;
    renderGame();
  } else {
    renderStart(saved);
  }

  function update(next: SoloState) {
    state = next;
    saveSolo(next);
    // 入力画面が提出ボタンの後始末を終えてから、画面を切り替える
    setTimeout(() => { renderGame(); window.scrollTo(0, 0); }, 0);
  }

  function renderStart(saved: SoloState | null, prev?: { difficulty: SoloDifficulty; pattern: MarketPattern }) {
    root.innerHTML = `<div class="page">
      <div class="lang-bar">${langToggleHtml()}</div>
      <h1>${t('solo.h1')}</h1>
      <div class="card">
        <p>${t('solo.intro')}</p>
        <p class="muted">${t('solo.local')}</p>
      </div>
      ${saved ? `<div class="card">
        <h2>${t('solo.resume.h2')}</h2>
        <p>${saved.difficulty ? t('solo.resume.difficulty', { d: esc(difficultyLabel(saved.difficulty)) }) : ''}${saved.config.market.pattern ? t('solo.resume.pattern', { p: esc(patternLabel(saved.config.market.pattern)) }) : ''}${saved.phase === 'final' ? t('solo.resume.final') : t('solo.resume.progress', { month: monthLabel(saved.conditions.month, saved.config.startCalendarMonth) })}</p>
        <button class="btn" id="resume">${t('solo.resume.btn')}</button>
      </div>` : ''}
      <div class="card">
        <h2>${saved ? t('solo.restart') : t('solo.new.h2')}</h2>
        <fieldset class="field"><legend>${t('solo.difficulty')}</legend>
          ${(Object.keys(SOLO_DIFFICULTY) as SoloDifficulty[]).map((d) => `<label class="radio">
            <input type="radio" name="difficulty" value="${d}" ${d === 'normal' ? 'checked' : ''}>
            <span><strong>${esc(difficultyLabel(d))}</strong><br><span class="muted">${esc(difficultyDesc(d))}</span></span>
          </label>`).join('')}
        </fieldset>
        <fieldset class="field"><legend>${t('solo.pattern')}</legend>
          ${(Object.keys(MARKET_PATTERNS) as MarketPattern[]).map((p) => `<label class="radio">
            <input type="radio" name="pattern" value="${p}" ${p === 'stable' ? 'checked' : ''}>
            <span><strong>${esc(patternLabel(p))}</strong><br><span class="muted">${esc(patternDesc(p))}</span></span>
          </label>`).join('')}
        </fieldset>
        <button class="btn ${saved ? 'secondary' : ''}" id="start">${saved ? t('solo.restart') : t('solo.start')}</button>
      </div>
      <p class="center"><a href="#/">${t('common.backTop')}</a></p></div>`;
    bindLangToggle(root);

    if (prev) {
      root.querySelector<HTMLInputElement>(`input[name="difficulty"][value="${prev.difficulty}"]`)!.checked = true;
      root.querySelector<HTMLInputElement>(`input[name="pattern"][value="${prev.pattern}"]`)!.checked = true;
    }
    root.querySelector('#resume')?.addEventListener('click', () => { state = saved; renderGame(); });
    root.querySelector('#start')!.addEventListener('click', () => {
      if (saved && !confirm(t('solo.confirmRestart'))) return;
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

  // お店の名前は、保存された名前ではなく表示するときの言語で出す
  //（resume のときは宣言より前に呼ばれるので、const ではなく function にしている）
  function names(s: SoloState): Record<string, string> {
    return Object.fromEntries(s.teams.map((tm) => [tm.teamId, soloTeamName(tm.teamId)]));
  }
  function slotsOf(s: SoloState): Record<string, TeamSlot> {
    return Object.fromEntries(s.teams.map((tm, i) => [tm.teamId, { name: soloTeamName(tm.teamId), order: i }]));
  }

  function renderGame() {
    const s = state;
    if (!s) return;
    const me = s.teams.find((tm) => tm.teamId === HUMAN_ID)!;
    const month = s.conditions.month;
    root.innerHTML = `<div class="page">
      <div class="topbar"><span class="team">🍋 ${esc(soloTeamName(HUMAN_ID))}</span>
        <span class="muted">${monthLabel(month, s.config.startCalendarMonth)}</span>
        <span class="num">${yen(me.balance)}</span></div>
      <div class="game-actions">
        ${langToggleHtml()}
        <button type="button" class="small" id="quit">${t('solo.quit')}</button>
        <button type="button" class="small" id="reset">${t('solo.restart')}</button>
      </div>
      <div id="view"></div></div>`;
    bindLangToggle(root);
    // いったんやめる：途中は保存されているので、あとで「続きから」遊べる
    root.querySelector('#quit')!.addEventListener('click', () => renderStart(loadSolo()));
    // 最初からやり直す：いまのゲームを消して、開始画面へ（前と同じ設定を選んだ状態にする）
    root.querySelector('#reset')!.addEventListener('click', () => {
      if (!confirm(t('solo.confirmReset'))) return;
      clearSolo();
      state = null;
      renderStart(null, { difficulty: s.difficulty ?? 'normal', pattern: s.config.market.pattern ?? 'stable' });
    });
    const view = root.querySelector<HTMLElement>('#view')!;

    if (s.phase === 'input') {
      const message = s.conditions.message ? newsText(s.conditions.message) : undefined;
      const clock: Clock = {
        month, monthKey: monthKey(month), phase: 'input', deadlineAt: 0, quarterStart: canChangeBarista(month, s.config.baristaCadence),
        prices: s.conditions.prices, ...(message ? { message } : {}),
      };
      mountInputView(
        view,
        { pub: publicConfigOf(s.config), clock, me, ownSub: null, closed: false },
        { decision: lastHumanDecision(s) ?? DEFAULT_DECISION, baristaCount: me.baristaCount },
        async (decision, baristaCount) => update(submitHuman(s, decision, baristaCount)),
        { submitLabel: t('solo.submit') },
      );
      // 最初の1回だけ、1か月目に手順を案内する
      if (month === 1) maybeStartInputCoach(view, t('solo.submit'));
      return;
    }

    if (s.phase === 'result') {
      const result = s.results[s.results.length - 1]!;
      const isLast = month >= s.config.months;
      renderMonthResult(view, result, HUMAN_ID, slotsOf(s), {
        nextLabel: isLast ? t('solo.seeYear') : t('solo.next'),
        onNext: () => update(nextSoloMonth(s)),
      });
      return;
    }

    // 期末：1年の振り返りと、ロボット店長の作戦の答え合わせ
    renderTermReport(view, {
      results: s.results, teams: s.teams, names: names(s), meId: HUMAN_ID,
      startFund: s.config.startFund, startCalendarMonth: s.config.startCalendarMonth, recipe: s.config.recipe,
    });
    const reveal = document.createElement('div');
    reveal.innerHTML = `<div class="card">
        <h2>${t('solo.reveal.h2')}</h2>
        <table class="table">${Object.entries(s.cpu).map(([id, type]) => `<tr>
          <td>${esc(soloTeamName(id))}</td>
          <td style="text-align:left"><strong>${esc(cpuLabel(type))}</strong><br>
            <span class="muted">${esc(cpuDesc(type))}</span></td></tr>`).join('')}</table>
        <p class="muted">${t('solo.reveal.p')}</p>
      </div>
      <div class="card"><h2>${t('solo.survey.h2')}</h2><div id="survey"></div></div>
      <button class="btn" id="again">${t('solo.again')}</button>`;
    view.appendChild(reveal);
    const ranked = [...s.teams].sort((a, b) => b.balance - a.balance);
    mountSurveyForm(reveal.querySelector('#survey')!, {
      source: 'solo-final',
      pattern: s.config.market.pattern,
      difficulty: s.difficulty,
      rank: ranked.findIndex((tm) => tm.teamId === HUMAN_ID) + 1,
      teams: s.teams.length,
      profit: s.teams.find((tm) => tm.teamId === HUMAN_ID)!.totalProfit,
    }, `solo-${s.config.market.seed}`);
    reveal.querySelector('#again')!.addEventListener('click', () => { clearSolo(); state = null; renderStart(null); });
  }

  return () => {};
}
