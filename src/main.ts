// 画面の切り替え（ハッシュで判定。GitHub Pages でも動くように）
//   #/team?code=XXXXXX  販売チーム
//   #/gm                GM
//   #/screen?code=…     全体表示
//   #/dev               開発用（エミュレーター接続時だけ）

import './ui/style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
let cleanup: (() => void) | void = undefined;

async function route() {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query ?? '');
  cleanup?.();
  cleanup = undefined;
  root.innerHTML = '';
  switch (path) {
    case '/team': {
      const { renderTeam } = await import('./screens/team/team');
      cleanup = await renderTeam(root, params);
      break;
    }
    case '/gm': {
      const { renderGm } = await import('./screens/gm/gm');
      cleanup = await renderGm(root, params);
      break;
    }
    case '/dev': {
      const { renderDev } = await import('./screens/dev/dev');
      await renderDev(root, params);
      break;
    }
    default:
      root.innerHTML = `<div class="page"><h1>🍋 レモネードスタンド</h1>
        <div class="card"><a class="btn" href="#/team">チームで参加する</a>
        <a class="btn secondary" href="#/gm">GM（進行役）</a></div></div>`;
  }
}

window.addEventListener('hashchange', route);
route();
