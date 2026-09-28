// 画面の切り替え（ハッシュで判定。GitHub Pages でも動くように）
//   #/team?code=XXXXXX  販売チーム
//   #/gm                GM
//   #/screen?code=…     全体表示
//   #/guide             はじめに（遊び方の説明）
//   #/survey            感想を送る（アンケート）
//   #/solo              ソロモード（ブラウザの中だけ。Firebase を使わない）
//   #/dev               開発用（エミュレーター接続時だけ）

import { esc } from './ui/format';
import { TITLE_EMOJI, TITLE_IDS } from './engine/titles';
import { loadAchievements } from './solo/achievements';
import { titleChip, titleDesc, titleName } from './ui/titles';
import './ui/style.css';
import { applyDocumentLang, t } from './i18n';
import { bindLangToggle, langToggleHtml } from './ui/lang-toggle';

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanup: (() => void) | void = undefined;

// 対戦（GM・チーム・全体表示）はまだ開発中。本番のビルドには含めない（Firebase も読み込まない）
const MULTIPLAYER = import.meta.env.VITE_ENABLE_MULTIPLAYER === 'true';

// resume：言語を切り替えたときは、遊んでいる途中のゲームにそのまま戻る
async function route(opts: { resume?: boolean } = {}) {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query ?? '');
  cleanup?.();
  cleanup = undefined;
  root.innerHTML = '';
  switch (path) {
    case '/team': {
      if (!MULTIPLAYER) { renderComingSoon(); break; }
      const { renderTeam } = await import('./screens/team/team');
      cleanup = await renderTeam(root, params);
      break;
    }
    case '/gm': {
      if (!MULTIPLAYER) { renderComingSoon(); break; }
      const { renderGm } = await import('./screens/gm/gm');
      cleanup = await renderGm(root, params);
      break;
    }
    case '/screen': {
      if (!MULTIPLAYER) { renderComingSoon(); break; }
      const { renderDashboard } = await import('./screens/dashboard/dashboard');
      cleanup = await renderDashboard(root, params);
      break;
    }
    case '/guide': {
      const { renderGuide } = await import('./screens/guide/guide');
      cleanup = renderGuide(root);
      break;
    }
    case '/survey': {
      const { renderSurveyPage } = await import('./screens/survey/survey-page');
      cleanup = renderSurveyPage(root);
      break;
    }
    case '/solo': {
      const { renderSolo } = await import('./screens/solo/solo');
      cleanup = renderSolo(root, opts);
      break;
    }
    case '/dev': {
      // 開発用ページは本番のビルドに含めない
      if (import.meta.env.VITE_USE_EMULATOR === 'true') {
        const { renderDev } = await import('./screens/dev/dev');
        await renderDev(root, params);
        break;
      }
      location.hash = '';
      break;
    }
    default:
      renderHome();
  }
}

function renderHome() {
  root.innerHTML = `<div class="page">
    <div class="lang-bar">${langToggleHtml()}</div>
    <h1>${t('home.h1')}</h1>
    <div class="card">
      <h2>${t('home.guide.h2')}</h2>
      <p style="margin:0 0 4px">${t('home.guide.p')}</p>
      <a class="btn secondary" href="#/guide">${t('home.guide.btn')}</a>
    </div>
    <div class="card">
      <h2>${t('home.solo.h2')}</h2>
      <p style="margin:0 0 4px">${t('home.solo.p')}</p>
      <a class="btn" href="#/solo">${t('home.solo.btn')}</a>
    </div>
    ${titleCollectionHtml()}
    <div class="card">
      <h2>${t('home.multi.h2')} ${MULTIPLAYER ? '' : `<span class="chip">${t('home.multi.badge')}</span>`}</h2>
      <p class="muted" style="margin:0 0 4px">${t('home.multi.p')}${MULTIPLAYER ? '' : t('home.multi.soon')}</p>
      ${MULTIPLAYER
        ? `<a class="btn secondary" href="#/team">${t('home.multi.team')}</a>
           <a class="btn secondary" href="#/gm">${t('home.multi.gm')}</a>`
        : `<button class="btn secondary" type="button" disabled>${t('home.multi.teamSoon')}</button>
           <button class="btn secondary" type="button" disabled>${t('home.multi.gmSoon')}</button>`}
    </div>
    <p class="center"><a href="#/survey">${t('home.survey')}</a></p></div>`;
  bindLangToggle(root);
}

// 肩書きコレクション：もらった肩書きは名前つき、まだの肩書きは条件だけ見せる
function titleCollectionHtml(): string {
  const got = loadAchievements().titles;
  const n = TITLE_IDS.filter((id) => got[id]).length;
  const total = TITLE_IDS.length;
  return `<div class="card">
      <h2>${t('home.titles.h2')}</h2>
      <p style="margin:0">${t('home.titles.progress', { n, total })}</p>
      <div class="title-progress"><span style="width:${(n / total) * 100}%"></span></div>
      ${n > 0 ? `<p style="margin:0 0 8px;display:flex;flex-wrap:wrap;gap:6px">${TITLE_IDS.filter((id) => got[id])
        .map((id) => titleChip(id, 'title-chip', got[id]!.count > 1 ? ` ${t('titles.count', { n: got[id]!.count })}` : '')).join('')}</p>` : ''}
      <details${n === 0 ? ' open' : ''}><summary class="muted">${t('home.titles.hint')}</summary>
        <div class="title-grid" style="margin-top:8px">${TITLE_IDS.map((id) => got[id]
          ? `<div class="title-card"><div class="name">${TITLE_EMOJI[id]} ${esc(titleName(id))}</div><div class="desc">${esc(titleDesc(id))}</div></div>`
          : `<div class="title-card locked"><div class="name">🔒 ${t('home.titles.locked')}</div><div class="desc">${esc(titleDesc(id))}</div></div>`).join('')}
        </div>
      </details>
    </div>`;
}

function renderComingSoon() {
  root.innerHTML = `<div class="page">
    <div class="lang-bar">${langToggleHtml()}</div>
    <div class="card center">
      <h2>${t('soon.h2')}</h2>
      <p>${t('soon.p')}</p>
      <a class="btn" href="#/solo">${t('soon.btn')}</a>
      <p><a href="#/">${t('common.backTop')}</a></p>
    </div></div>`;
  bindLangToggle(root);
}

applyDocumentLang();
window.addEventListener('hashchange', () => route());
// 言語を切り替えたら、いまの画面を作り直す
window.addEventListener('langchange', () => route({ resume: true }));
route();
