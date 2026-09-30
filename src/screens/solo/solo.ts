// ソロモード（#/solo）：人1チーム vs CPU 3チーム（画面では「ロボット店長」）。ブラウザの中だけで12か月遊ぶ（Firebase は使わない）。
// 入力画面と結果画面は販売チーム画面のものを使う。

import { rankTeams } from '../../engine/month';
import { canChangeBarista, MARKET_PATTERNS } from '../../engine/config';
import type { MarketPattern } from '../../engine/types';
import { lang, t } from '../../i18n';
import { cpuDesc, cpuLabel, difficultyDesc, difficultyLabel, newsText, patternDesc, patternLabel, soloTeamName } from '../../i18n/content';
import {
  clearSolo, HUMAN_ID, humanEliminatedMonth, lastHumanDecision, startNextYear, titlesOfYear, loadSolo, newSoloGame, nextSoloMonth, saveSolo, SOLO_DIFFICULTY, SOLO_TEAM_COUNT, submitHuman,
  type SoloDifficulty, type SoloState,
} from '../../solo/local-game';
import { monthKey, publicConfigOf, type Clock, type TeamSlot } from '../../sync/schema';
import { esc, monthLabel, monthShort, signedYen, yen } from '../../ui/format';
import { barChartSvg } from '../../ui/bar-chart';
import {
  isYearEnd, MAX_YEARS, MONTHS_PER_YEAR, resultsOfYear, standingsAt, yearlySummary, yearOf, yearsOf,
} from '../../engine/years';
import { bindLangToggle, langToggleHtml } from '../../ui/lang-toggle';
import { maybeStartInputCoach } from '../team/input-coach';
import { DEFAULT_DECISION, mountInputView } from '../team/input-view';
import { renderMonthStory } from '../team/month-story';
import { renderTermReport } from '../report/report';
import { openSheets, sheetHtml, summarySheetHtml } from '../report/sheet';
import { recordYearTitles } from '../../solo/achievements';
import { SHOWN_TITLES, TITLE_IDS, type TitleId } from '../../engine/titles';
import { titleChip, titleDesc } from '../../ui/titles';
import { mountSurveyForm } from '../survey/survey-form';

const PLAY_HASH = '#/solo/play';

// resume：言語を切り替えたときなど、保存されたゲームがあればそのまま続きを表示する
export function renderSolo(root: HTMLElement, opts: { resume?: boolean } = {}): () => void {
  let state: SoloState | null = null;
  // この画面で、はじめてもらった肩書き（「NEW!」をつける）
  const unlocked = new Set<TitleId>();

  // ゲーム中は URL を #/solo/play にし、履歴にもう1つ「ガード」を積む。
  // ブラウザの「戻る」を押すと、まずガードが外れて popstate が来るので、そこで本当に抜けるか確かめる
  let guarded = false;
  function enterPlay() {
    if (location.hash !== PLAY_HASH) history.pushState(null, '', PLAY_HASH);
    if (history.state?.soloGuard) guarded = true; // 再読みこみしたときは、もう積んである
    if (!guarded) {
      history.pushState({ soloGuard: true }, '', PLAY_HASH);
      guarded = true;
    }
  }
  function leavePlay() {
    guarded = false;
    if (location.hash === PLAY_HASH) history.replaceState(null, '', '#/solo');
  }
  function onPopState() {
    if (!guarded || location.hash !== PLAY_HASH) return;
    guarded = false;
    if (confirm(t('solo.confirmLeave'))) history.back();
    else {
      history.pushState({ soloGuard: true }, '', PLAY_HASH);
      guarded = true;
    }
  }
  window.addEventListener('popstate', onPopState);

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
    // 年が終わったら、その年の肩書きをコレクションに記録する（同じ年は2回数えない）
    if (next.phase === 'yearEnd' || next.phase === 'final') {
      const lastYear = yearOf(next.results[next.results.length - 1]!.month);
      for (let y = 1; y <= lastYear; y++) {
        for (const id of recordYearTitles(next.config.market.seed, y, titlesOfYear(next, y))) unlocked.add(id);
      }
    }
    // 入力画面が提出ボタンの後始末を終えてから、画面を切り替える
    setTimeout(() => { renderGame(); window.scrollTo(0, 0); }, 0);
  }

  function renderStart(saved: SoloState | null, prev?: { difficulty: SoloDifficulty; pattern: MarketPattern; teamCount: number; elimination: boolean; years: number }) {
    leavePlay();
    root.innerHTML = `<div class="page">
      <div class="lang-bar">${langToggleHtml()}</div>
      <h1>${t('solo.h1')}</h1>
      <div class="card">
        <p>${t('solo.intro')}</p>
        <p class="muted">${t('solo.local')}</p>
      </div>
      ${saved ? `<div class="card">
        <h2>${t('solo.resume.h2')}</h2>
        <p>${yearsOf(saved.config) > 1 ? t('solo.resume.years', { n: yearsOf(saved.config) }) : ''}${t('solo.resume.teams', { n: saved.teams.length })}${saved.config.elimination ? t('solo.resume.elimination') : ''}${saved.difficulty ? t('solo.resume.difficulty', { d: esc(difficultyLabel(saved.difficulty)) }) : ''}${saved.config.market.pattern ? t('solo.resume.pattern', { p: esc(patternLabel(saved.config.market.pattern)) }) : ''}${saved.phase === 'final' ? t('solo.resume.final') : t('solo.resume.progress', { month: monthLabel(saved.phase === 'yearEnd' ? saved.conditions.month - 1 : saved.conditions.month, saved.config.startCalendarMonth, saved.config.months) })}</p>
        <button class="btn" id="resume">${t('solo.resume.btn')}</button>
      </div>` : ''}
      <div class="card">
        <h2>${saved ? t('solo.restart') : t('solo.new.h2')}</h2>
        <div class="start-grid"><div>
        <fieldset class="field"><legend>${t('solo.difficulty')}</legend>
          ${(Object.keys(SOLO_DIFFICULTY) as SoloDifficulty[]).map((d) => `<label class="radio">
            <input type="radio" name="difficulty" value="${d}" ${d === 'normal' ? 'checked' : ''}>
            <span><strong>${esc(difficultyLabel(d))}</strong><br><span class="muted">${esc(difficultyDesc(d))}</span></span>
          </label>`).join('')}
        </fieldset>
        <label class="field"><span class="field-label">${t('solo.teamCount')}</span>
          <select id="teamCount">${Array.from({ length: SOLO_TEAM_COUNT.max - SOLO_TEAM_COUNT.min + 1 }, (_, i) => SOLO_TEAM_COUNT.min + i)
            .map((n) => `<option value="${n}" ${n === SOLO_TEAM_COUNT.default ? 'selected' : ''}>${t('solo.teamCount.option', { n, cpu: n - 1 })}</option>`).join('')}</select>
          <span class="muted field-help">${t('solo.teamCount.help')}</span>
        </label>
        <label class="field"><span class="field-label">${t('solo.years')}</span>
          <select id="years">${Array.from({ length: MAX_YEARS }, (_, i) => i + 1)
            .map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${t('solo.years.option', { n, m: n * MONTHS_PER_YEAR })}</option>`).join('')}</select>
          <span class="muted field-help">${t('solo.years.help')}</span>
        </label>
        <label class="check field" style="align-items:flex-start"><input type="checkbox" id="elimination" style="margin-top:4px">
          <span><strong>${t('solo.elimination')}</strong><span class="muted field-help">${t('solo.elimination.help')}</span></span>
        </label>
        </div><div>
        <fieldset class="field"><legend>${t('solo.pattern')}</legend>
          ${(Object.keys(MARKET_PATTERNS) as MarketPattern[]).map((p) => `<label class="radio">
            <input type="radio" name="pattern" value="${p}" ${p === 'stable' ? 'checked' : ''}>
            <span><strong>${esc(patternLabel(p))}</strong><br><span class="muted">${esc(patternDesc(p))}</span></span>
          </label>`).join('')}
        </fieldset>
        </div></div>
        <button class="btn ${saved ? 'secondary' : ''}" id="start">${saved ? t('solo.restart') : t('solo.start')}</button>
      </div>
      <p class="center"><a href="#/">${t('common.backTop')}</a></p></div>`;
    bindLangToggle(root);

    if (prev) {
      root.querySelector<HTMLInputElement>(`input[name="difficulty"][value="${prev.difficulty}"]`)!.checked = true;
      root.querySelector<HTMLInputElement>(`input[name="pattern"][value="${prev.pattern}"]`)!.checked = true;
      root.querySelector<HTMLSelectElement>('#teamCount')!.value = String(prev.teamCount);
      root.querySelector<HTMLInputElement>('#elimination')!.checked = prev.elimination;
      root.querySelector<HTMLSelectElement>('#years')!.value = String(prev.years);
    }
    root.querySelector('#resume')?.addEventListener('click', () => { state = saved; renderGame(); });
    root.querySelector('#start')!.addEventListener('click', () => {
      if (saved && !confirm(t('solo.confirmRestart'))) return;
      clearSolo();
      const s = newSoloGame({
        seed: `solo-${Date.now()}`,
        pattern: (root.querySelector<HTMLInputElement>('input[name="pattern"]:checked')?.value ?? 'stable') as MarketPattern,
        difficulty: (root.querySelector<HTMLInputElement>('input[name="difficulty"]:checked')?.value ?? 'normal') as SoloDifficulty,
        teamCount: Number(root.querySelector<HTMLSelectElement>('#teamCount')!.value),
        elimination: root.querySelector<HTMLInputElement>('#elimination')!.checked,
        years: Number(root.querySelector<HTMLSelectElement>('#years')!.value),
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
    enterPlay();
    const me = s.teams.find((tm) => tm.teamId === HUMAN_ID)!;
    const month = s.conditions.month;
    // 年の決算のときは、もう次の年の1か月目の条件になっているので、終わった月を出す
    const shownMonth = s.phase === 'yearEnd' ? month - 1 : month;
    root.innerHTML = `<div class="page">
      <div class="topbar"><span class="team">🍋 ${esc(soloTeamName(HUMAN_ID))}</span>
        <span class="muted">${monthLabel(shownMonth, s.config.startCalendarMonth, s.config.months)}</span>
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
      renderStart(null, { difficulty: s.difficulty ?? 'normal', pattern: s.config.market.pattern ?? 'stable', teamCount: s.teams.length, elimination: s.config.elimination === true, years: yearsOf(s.config) });
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
        {
          pub: publicConfigOf(s.config), clock, me, ownSub: null, closed: false,
          ...(s.results.length > 0 ? { lastMonth: { result: s.results[s.results.length - 1]!, names: names(s) } } : {}),
        },
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
      const youOut = humanEliminatedMonth(s) !== null;
      const yearEnd = isYearEnd(month) && !isLast && !youOut;
      renderMonthStory(view, result, HUMAN_ID, slotsOf(s), {
        nextLabel: isLast || youOut ? t('solo.seeYear') : yearEnd ? t('solo.seeYearEnd', { y: yearOf(month) }) : t('solo.next'),
        onNext: () => update(nextSoloMonth(s)),
        eliminated: Object.fromEntries(s.teams.filter((tm) => tm.eliminatedMonth !== undefined && tm.eliminatedMonth < month)
          .map((tm) => [tm.teamId, outLabel(s)(tm.eliminatedMonth!)])),
        recipe: s.config.recipe, baristaCapacity: s.config.baristaCapacity,
        ...(s.results.length >= 2 ? { previous: s.results[s.results.length - 2]! } : {}),
      });
      return;
    }

    // 年の決算（2年以上のとき、年の終わりに）：その年の振り返りと、次の年へ進むボタン
    if (s.phase === 'yearEnd') {
      const year = yearOf(s.results[s.results.length - 1]!.month);
      renderYearReport(view, s, year, t('report.yearHeading', { y: year }));
      insertAfterFirst(view, titlesCard(titlesOfYear(s, year), t('titles.yearH2', { y: year })));
      const box = document.createElement('div');
      box.innerHTML = `<button class="btn secondary" id="sheet" type="button">${t('sheet.openYear', { y: year })}</button>
        <button class="btn" id="nextYear" type="button">${t('solo.nextYear', { y: year + 1 })}</button>`;
      view.appendChild(box);
      box.querySelector('#sheet')!.addEventListener('click', () => openSheets([yearSheet(s, year)]));
      box.querySelector('#nextYear')!.addEventListener('click', () => update(startNextYear(s)));
      return;
    }

    // 期末：振り返りと、ロボット店長の作戦の答え合わせ
    const years = yearsOf(s.config);
    if (years === 1) {
      renderYearReport(view, s, 1);
      insertAfterFirst(view, titlesCard(titlesOfYear(s, 1), t('titles.h2')));
    } else {
      // 2年以上：通算の記録のあとに、最後に営業した年の決算
      const rows = yearlySummary(s.results, s.teams, HUMAN_ID, s.config.recipe, s.config.startFund);
      const ranked = rankTeams([...s.teams]);
      const summary = document.createElement('div');
      summary.innerHTML = `<div class="card center">
          <h2>${t('report.h2Years', { n: years })}</h2>
          <p class="big" style="margin:4px 0">${t('report.rank', { rank: ranked.findIndex((tm) => tm.teamId === HUMAN_ID) + 1 })} <span class="muted" style="font-size:1rem">${t('report.ofTeams', { n: s.teams.length })}</span></p>
          <p style="margin:0">${t('report.balance', { b: yen(me.balance), s: yen(s.config.startFund) })}</p>
          <p style="margin:4px 0 0">${t('years.totalProfit', { n: years })} <strong class="${me.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(me.totalProfit)}</strong></p>
        </div>
        <div class="card"><h2>${t('years.h2')}</h2>
          <div class="chart" id="yearChart"></div>
          <div class="table-scroll"><table class="table report-table">
            <tr><th>${t('years.th.year')}</th><th>${t('years.th.sales')}</th><th>${t('years.th.cost')}</th><th>${t('years.th.profit')}</th><th>${t('years.th.end')}</th><th>${t('years.th.rank')}</th></tr>
            ${rows.map((r) => `<tr><td>${t('years.label', { y: r.year })}</td><td>${yen(r.revenue)}</td><td>${yen(r.cost)}</td>
              <td class="${r.profit >= 0 ? 'good' : 'bad'}">${signedYen(r.profit)}</td><td>${yen(r.endBalance)}</td>
              <td>${t('sheet.tile.rankValue', { rank: r.rank, n: s.teams.length })}</td></tr>`).join('')}
            <tr class="total"><td>${t('years.total')}</td><td>${yen(rows.reduce((a, r) => a + r.revenue, 0))}</td><td>${yen(rows.reduce((a, r) => a + r.cost, 0))}</td>
              <td class="${me.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(me.totalProfit)}</td><td>${yen(me.balance)}</td><td></td></tr>
          </table></div>
        </div>
        <div class="card"><h2>${t('years.allH2', { n: years })}</h2>
          <div class="table-scroll"><table class="table report-table all-years">
            <tr><th>${t('years.th.rank')}</th><th>${t('years.all.th.shop')}</th><th class="wide-only">${t('years.th.sales')}</th><th class="wide-only">${t('years.th.cost')}</th><th>${t('years.all.th.profit')}</th><th>${t('years.th.end')}</th></tr>
            ${ranked.map((tm, i) => {
              const own = s.results.flatMap((r) => r.teamResults.filter((x) => x.teamId === tm.teamId));
              const rev = own.reduce((a, x) => a + x.revenue, 0);
              const cost = own.reduce((a, x) => a + x.totalCost, 0);
              const out = tm.eliminatedMonth !== undefined ? ` <span class="muted">${t('years.all.out', { m: outLabel(s)(tm.eliminatedMonth) })}</span>` : '';
              return `<tr${tm.teamId === HUMAN_ID ? ' class="me"' : ''}><td>${i + 1}</td><td>${esc(soloTeamName(tm.teamId))}${out}</td><td class="wide-only">${yen(rev)}</td><td class="wide-only">${yen(cost)}</td>
                <td class="${tm.totalProfit >= 0 ? 'good' : 'bad'}">${signedYen(tm.totalProfit)}</td><td>${yen(tm.balance)}</td></tr>`;
            }).join('')}
          </table></div>
        </div>`;
      view.appendChild(summary);
      insertAfterFirst(summary, titlesCard(collected(s), t('titles.allH2', { n: years })));
      const chart = summary.querySelector<HTMLElement>('#yearChart')!;
      chart.innerHTML = barChartSvg({
        values: rows.map((r) => r.profit), labels: rows.map((r) => t('years.label', { y: r.year })),
        formatY: (v) => (lang() === 'en' ? `${Math.round(v / 1000)}k` : `${Math.round(v / 10000)}万`), formatValue: signedYen,
        width: Math.max(300, chart.clientWidth || 320), height: 180, ariaLabel: t('years.chart'),
      });
      const lastYear = rows.length > 0 ? rows[rows.length - 1]!.year : 1;
      const last = document.createElement('div');
      view.appendChild(last);
      renderYearReport(last, s, lastYear, t('report.yearHeading', { y: lastYear }));
    }
    const reveal = document.createElement('div');
    const sheetYears = yearlySummary(s.results, s.teams, HUMAN_ID, s.config.recipe, s.config.startFund).map((r) => r.year);
    reveal.innerHTML = `<button class="btn" id="sheet" type="button">${years === 1 ? t('sheet.open') : t('sheet.openAll', { n: sheetYears.length + 1 })}</button>
      <div class="card">
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
    reveal.querySelector('#sheet')!.addEventListener('click', () => openSheets(years === 1
      ? [yearSheet(s, 1)]
      : [...sheetYears.map((y) => yearSheet(s, y)), summarySheetHtml({
        results: s.results, teams: s.teams, meId: HUMAN_ID, startFund: s.config.startFund,
        startCalendarMonth: s.config.startCalendarMonth, recipe: s.config.recipe, baristaCapacity: s.config.baristaCapacity,
        condition: conditionOf(s), years, titles: collected(s),
      })]));
    const ranked = rankTeams([...s.teams]);
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

  // シートの見出しに出す条件
  function conditionOf(s: SoloState) {
    return {
      ...(s.difficulty ? { difficulty: difficultyLabel(s.difficulty) } : {}),
      ...(s.config.market.pattern ? { pattern: patternLabel(s.config.market.pattern) } : {}),
      teamCount: s.teams.length, elimination: s.config.elimination === true,
    };
  }

  // 脱落した月の表示（2年以上なら「2年目の6月」）
  function outLabel(s: SoloState) {
    return (m: number) => (yearsOf(s.config) > 1
      ? t('sheet.monthOfYear', { y: yearOf(m), m: monthShort(m, s.config.startCalendarMonth) })
      : monthShort(m, s.config.startCalendarMonth));
  }

  // その年のはじめ・終わりの時点の各お店
  function yearStandings(s: SoloState, year: number) {
    const rs = resultsOfYear(s.results, year);
    const endMonth = rs.length > 0 ? rs[rs.length - 1]!.month : year * MONTHS_PER_YEAR;
    const atStart = standingsAt(s.results, s.teams, (year - 1) * MONTHS_PER_YEAR, s.config.startFund);
    const startBalances = Object.fromEntries(atStart.map((tm) => [tm.teamId, tm.balance]));
    // 「1年のもうけ」はその年の分（年の終わりまでの合計 − 年のはじめまでの合計）
    const teams = standingsAt(s.results, s.teams, endMonth, s.config.startFund).map((tm, i) => ({
      ...tm, totalProfit: tm.totalProfit - atStart[i]!.totalProfit,
    }));
    return { rs, teams, startBalances };
  }

  function renderYearReport(container: HTMLElement, s: SoloState, year: number, heading?: string) {
    const { rs, teams, startBalances } = yearStandings(s, year);
    renderTermReport(container, {
      results: rs, teams, names: names(s), meId: HUMAN_ID,
      startFund: s.config.startFund, startCalendarMonth: s.config.startCalendarMonth, recipe: s.config.recipe,
      startBalances, outLabel: outLabel(s), ...(heading ? { heading } : {}),
    });
  }

  function yearSheet(s: SoloState, year: number): string {
    const { rs, teams, startBalances } = yearStandings(s, year);
    return sheetHtml({
      results: rs, teams, meId: HUMAN_ID, startFund: startBalances[HUMAN_ID] ?? s.config.startFund,
      startCalendarMonth: s.config.startCalendarMonth, recipe: s.config.recipe, baristaCapacity: s.config.baristaCapacity,
      condition: conditionOf(s), ...(yearsOf(s.config) > 1 ? { year } : {}),
      titles: titlesOfYear(s, year).slice(0, SHOWN_TITLES),
    });
  }

  // 全期間で集めた肩書き（表示の順。何回もらっても1つ）
  function collected(s: SoloState): TitleId[] {
    const got = new Set<TitleId>();
    for (let y = 1; y <= yearsOf(s.config); y++) for (const id of titlesOfYear(s, y)) got.add(id);
    return TITLE_IDS.filter((id) => got.has(id));
  }

  // 肩書きのカード（名前と、どうしてついたか）
  function titlesCard(ids: TitleId[], heading: string): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = ids.length === 0 ? '' : `<h2>${heading}</h2>
      <ul class="title-list">${ids.map((id) => `<li>${titleChip(id, 'title-chip',
        unlocked.has(id) ? `<span class="title-new">${t('titles.new')}</span>` : '')}
        <span class="desc">${esc(titleDesc(id))}</span></li>`).join('')}</ul>
      <p class="muted" style="margin:10px 0 0;font-size:0.85rem">${t('titles.more')}</p>`;
    return card;
  }

  // いちばん上のカード（見出し・順位）のすぐ下に入れる
  function insertAfterFirst(container: HTMLElement, el: HTMLElement) {
    if (!el.innerHTML) return;
    container.insertBefore(el, container.children[1] ?? null);
  }

  return () => window.removeEventListener('popstate', onPopState);
}
