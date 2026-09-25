// GM 画面の入口：ログイン → ゲーム一覧・新規作成 → 進行画面

import type { User } from 'firebase/auth';
import { signInAsDevGm, signInAsGm, signOutUser, waitForAuth } from '../../sync/auth';
import { firebase } from '../../sync/firebase';
import { cleanupOldGames, createGame, readPath } from '../../sync/game';
import type { Clock, GameMeta } from '../../sync/schema';
import { watchMyGames, watchServerOffset } from '../../sync/watch';
import { esc } from '../../ui/format';
import { mountCreateForm } from './create-form';
import { mountGameView } from './game-view';

export async function renderGm(root: HTMLElement, params: URLSearchParams): Promise<() => void> {
  const { auth, db } = firebase('gm');
  root.innerHTML = '<div class="page wide"><p class="muted">読み込み中…</p></div>';
  let user = await waitForAuth(auth);
  if (!user || user.isAnonymous) {
    user = await renderSignIn(root);
  }

  const code = (params.get('code') ?? '').toUpperCase();
  if (code) return mountGameView(root, db, user.uid, code);
  return renderHome(root, user);

  function renderHome(root: HTMLElement, user: User): () => void {
    let offset = 0;
    const unsubOffset = watchServerOffset(db, (o) => { offset = o; });
    root.innerHTML = `<div class="page wide">
      <div class="topbar"><strong>🍋 GM</strong>
        <span class="muted">${esc(user.email ?? user.displayName ?? '')} <button class="small" id="signout">ログアウト</button></span></div>
      <div class="card"><h2>自分のゲーム</h2><div id="games" class="muted">読み込み中…</div></div>
      <div id="create"></div></div>`;
    root.querySelector('#signout')!.addEventListener('click', async () => {
      await signOutUser(auth);
      location.reload();
    });

    const unsubGames = watchMyGames(db, user.uid, async (games) => {
      const codes = Object.entries(games).sort((a, b) => b[1] - a[1]).map(([c]) => c);
      const el = root.querySelector('#games');
      if (!el) return;
      if (codes.length === 0) { el.textContent = 'まだありません。'; return; }
      const rows = await Promise.all(codes.map(async (c) => {
        const [meta, clock] = await Promise.all([
          readPath<GameMeta>(db, `games/${c}/meta`).catch(() => null),
          readPath<Clock>(db, `games/${c}/clock`).catch(() => null),
        ]);
        const when = new Date(games[c]!).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' });
        const status = !meta ? '削除済み' : meta.status === 'ended' ? '終了' : clock?.phase === 'lobby' ? '開始前' : `${clock?.month ?? 0}か月目`;
        return `<tr><td><a href="#/gm?code=${c}">${c}</a></td><td>${when}</td><td>${status}</td></tr>`;
      }));
      el.innerHTML = `<table class="table"><tr><th>コード</th><th>作成</th><th>状態</th></tr>${rows.join('')}</table>`;
    });

    mountCreateForm(root.querySelector('#create')!, async (input) => {
      const now = Date.now() + offset;
      // 作成から30日以上たった自分のゲームを削除する
      await cleanupOldGames(db, user.uid, now).catch(() => []);
      const code = await createGame(db, user.uid, { ...input, now });
      location.hash = `#/gm?code=${code}`;
    });

    return () => { unsubOffset(); unsubGames(); };
  }

  function renderSignIn(root: HTMLElement): Promise<User> {
    return new Promise((resolve) => {
      root.innerHTML = `<div class="page">
        <h1>🍋 レモネードスタンド：GM</h1>
        <div class="card">
          <p>ゲームを作って進行するには、Google アカウントでログインしてください。</p>
          <button class="btn" id="signin">Google でログイン</button>
          ${import.meta.env.VITE_USE_EMULATOR === 'true' ? '<button class="btn secondary" id="devsignin">開発用：テスト GM でログイン</button>' : ''}
          <p class="muted" id="err"></p>
        </div></div>`;
      root.querySelector('#devsignin')?.addEventListener('click', async () => resolve(await signInAsDevGm(auth)));
      root.querySelector('#signin')!.addEventListener('click', async () => {
        try {
          resolve(await signInAsGm(auth));
        } catch (e) {
          root.querySelector('#err')!.textContent = `ログインできませんでした：${(e as Error).message}`;
        }
      });
    });
  }
}
