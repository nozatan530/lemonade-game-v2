// 画面の切り替え（ハッシュで判定。GitHub Pages でも動くように）
//   #/team?code=XXXXXX  販売チーム
//   #/gm                GM
//   #/screen?code=…     全体表示
//   #/solo              ソロモード（ブラウザの中だけ。Firebase を使わない）
//   #/dev               開発用（エミュレーター接続時だけ）

import './ui/style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanup: (() => void) | void = undefined;

// 対戦（GM・チーム・全体表示）はまだ開発中。本番のビルドには含めない（Firebase も読み込まない）
const MULTIPLAYER = import.meta.env.VITE_ENABLE_MULTIPLAYER === 'true';

async function route() {
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
    case '/solo': {
      const { renderSolo } = await import('./screens/solo/solo');
      cleanup = renderSolo(root);
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
  root.innerHTML = `<div class="page"><h1>🍋 レモネードスタンド</h1>
    <div class="card">
      <h2>ひとりで遊ぶ（ソロモード）</h2>
      <p style="margin:0 0 4px">CPU の3つのお店と、1年間（12か月）もうけを競います。材料を仕入れて、値段を決めて、レモネードを売りましょう。</p>
      <a class="btn" href="#/solo">はじめる</a>
    </div>
    <div class="card">
      <h2>みんなで対戦 ${MULTIPLAYER ? '' : '<span class="chip">開発中</span>'}</h2>
      <p class="muted" style="margin:0 0 4px">ゲームマスター（進行役）が進めて、チームどうしで競います。${MULTIPLAYER ? '' : 'いま準備中です。'}</p>
      ${MULTIPLAYER
        ? `<a class="btn secondary" href="#/team">チームで参加する</a>
           <a class="btn secondary" href="#/gm">GM（進行役）</a>`
        : `<button class="btn secondary" type="button" disabled>チームで参加する（開発中）</button>
           <button class="btn secondary" type="button" disabled>GM（進行役）（開発中）</button>`}
    </div></div>`;
}

function renderComingSoon() {
  root.innerHTML = `<div class="page"><h1>🍋 レモネードスタンド</h1>
    <div class="card center">
      <h2>みんなで対戦するモードは開発中です</h2>
      <p>いまは、ひとりで CPU のお店と競うソロモードで遊べます。</p>
      <a class="btn" href="#/solo">ソロモードで遊ぶ</a>
      <p><a href="#/">トップにもどる</a></p>
    </div></div>`;
}

window.addEventListener('hashchange', route);
route();
