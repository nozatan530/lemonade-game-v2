// 画面の切り替え（ハッシュで判定。GitHub Pages でも動くように）
//   #/team?code=XXXXXX  販売チーム
//   #/gm                GM
//   #/screen?code=…     全体表示
//   #/dev               開発用（エミュレーター接続時だけ）

import './ui/style.css';

const root = document.querySelector<HTMLDivElement>('#app')!;

async function route() {
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query ?? '');
  root.innerHTML = '';
  switch (path) {
    case '/team': {
      const { renderTeam } = await import('./screens/team/team');
      await renderTeam(root, params);
      break;
    }
    case '/dev': {
      const { renderDev } = await import('./screens/dev/dev');
      await renderDev(root, params);
      break;
    }
    default:
      root.textContent = '🍋 レモネードスタンド（準備中）';
  }
}

window.addEventListener('hashchange', route);
route();
