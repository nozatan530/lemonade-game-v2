// 画面の切り替え（ハッシュで判定。GitHub Pages でも動くように）
//   #/team?code=XXXXXX  販売チーム
//   #/gm                GM
//   #/screen?code=…     全体表示
//   #/guide             はじめに（遊び方の説明）
//   #/survey            感想を送る（アンケート）
//   #/solo              ソロモード（ブラウザの中だけ。Firebase を使わない）
//   #/solo/play         ソロモードのゲーム中（「戻る」で抜ける前に確かめる）
//   #/dev               開発用（エミュレーター接続時だけ）

import { esc } from './ui/format';
import { TITLE_EMOJI, TITLE_IDS } from './engine/titles';
import { loadAchievements } from './solo/achievements';
import { titleChip, titleDesc, titleName } from './ui/titles';
import './ui/style.css';
import { applyDocumentLang, pinLang, t } from './i18n';
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
  // 対戦（チーム・GM・全体表示）は、英語に対応するまで日本語で出す
  pinLang(['/team', '/gm', '/screen'].includes(path ?? '') ? 'ja' : null);
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
    case '/solo':
    case '/solo/play': {
      // #/solo/play はゲームの途中。再読みこみしても続きを出す
      const { renderSolo } = await import('./screens/solo/solo');
      cleanup = renderSolo(root, path === '/solo/play' ? { resume: true } : opts);
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
    <div class="home-layout"><div class="home-main">
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
    <div class="card">
      <h2>${t('home.multi.h2')} ${MULTIPLAYER ? '' : `<span class="chip">${t('home.multi.badge')}</span>`}</h2>
      <p class="muted" style="margin:0 0 4px">${t('home.multi.p')}${MULTIPLAYER ? '' : t('home.multi.soon')}</p>
      ${MULTIPLAYER
        ? `<a class="btn secondary" href="#/team">${t('home.multi.team')}</a>
           <p class="muted" style="margin:10px 0 0;font-size:0.9rem">${t('home.multi.gmNote')} <a href="#/gm">${t('home.multi.gm')}</a></p>`
        : `<button class="btn secondary" type="button" disabled>${t('home.multi.teamSoon')}</button>
           <button class="btn secondary" type="button" disabled>${t('home.multi.gmSoon')}</button>`}
    </div>
    </div>
    ${titleCollectionHtml()}
    </div>
    <p class="center"><a href="#/survey">${t('home.survey')}</a></p></div>`;
  bindLangToggle(root);
  root.querySelector<HTMLDetailsElement>('[data-titles]')!.addEventListener('toggle', (e) => {
    try {
      localStorage.setItem(TITLES_OPEN_KEY, (e.target as HTMLDetailsElement).open ? '1' : '0');
    } catch {
      // 保存できなくても開け閉めはできる
    }
  });
}

// 肩書きコレクション：もらった肩書きは名前つき、まだの肩書きは条件だけ見せる。
// カードごと折りたためる（開いているかどうかはブラウザに覚える。はじめは広い画面なら開く）
const TITLES_OPEN_KEY = 'lemonade-titles-open';

function titlesOpen(): boolean {
  try {
    const v = localStorage.getItem(TITLES_OPEN_KEY);
    if (v !== null) return v === '1';
  } catch {
    // 保存できない環境
  }
  return window.matchMedia('(min-width: 900px) and (min-height: 500px)').matches;
}

function titleCollectionHtml(): string {
  const got = loadAchievements().titles;
  const n = TITLE_IDS.filter((id) => got[id]).length;
  const total = TITLE_IDS.length;
  return `<details class="card home-titles" data-titles${titlesOpen() ? ' open' : ''}>
      <summary>
        <h2>${t('home.titles.h2')}</h2>
        <span class="muted">${t('home.titles.progress', { n, total })}</span>
        <div class="title-progress"><span style="width:${(n / total) * 100}%"></span></div>
      </summary>
      ${n > 0 ? `<p style="margin:0 0 8px;display:flex;flex-wrap:wrap;gap:6px">${TITLE_IDS.filter((id) => got[id])
        .map((id) => titleChip(id)).join('')}</p>` : ''}
      <p class="muted" style="margin:0 0 8px;font-size:0.9rem">${t('home.titles.hint')}</p>
      <div class="title-grid">${TITLE_IDS.map((id) => got[id]
        ? `<div class="title-card"><div class="name">${TITLE_EMOJI[id]} ${esc(titleName(id))}</div><div class="desc">${esc(titleDesc(id))}</div></div>`
        : `<div class="title-card locked"><div class="name">🔒 ${t('home.titles.locked')}</div><div class="desc">${esc(titleDesc(id))}</div></div>`).join('')}
      </div>
    </details>`;
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
