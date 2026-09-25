// 画面の切り替え（ハッシュで判定。GitHub Pages でも動くように）
//   #/team?code=XXXXXX  販売チーム
//   #/gm                GM
//   #/screen?code=…     全体表示
//   #/dev               開発用（エミュレーター接続時だけ）

const root = document.querySelector<HTMLDivElement>('#app')!;

async function route() {
  const [path] = location.hash.replace(/^#/, '').split('?');
  root.innerHTML = '';
  switch (path) {
    case '/dev': {
      const { renderDev } = await import('./screens/dev/dev');
      await renderDev(root);
      break;
    }
    default:
      root.textContent = '🍋 レモネードスタンド（準備中）';
  }
}

window.addEventListener('hashchange', route);
route();
