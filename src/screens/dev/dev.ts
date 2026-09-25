// 開発用ページ（エミュレーター接続時だけ）。GM 画面ができる前に、ゲームの作成と進行をボタンで行う。

import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { DEFAULT_TIMER, defaultConfig } from '../../engine/config';
import { firebase } from '../../sync/firebase';
import { closeCurrentMonth, createGame, extendDeadline, startGame, startNextMonth } from '../../sync/game';
import { watchClock, watchServerOffset, watchSubmitted, watchTeams } from '../../sync/watch';

const DEV_GM = { email: 'dev-gm@example.com', password: 'dev-password' };

export async function renderDev(root: HTMLElement): Promise<void> {
  if (import.meta.env.VITE_USE_EMULATOR !== 'true') {
    root.textContent = 'このページはエミュレーター接続時だけ使えます。';
    return;
  }
  const { auth, db } = firebase();
  const cred = await signInWithEmailAndPassword(auth, DEV_GM.email, DEV_GM.password)
    .catch(() => createUserWithEmailAndPassword(auth, DEV_GM.email, DEV_GM.password));
  const uid = cred.user.uid;

  let offset = 0;
  watchServerOffset(db, (o) => { offset = o; });
  const now = () => Date.now() + offset;

  root.innerHTML = `
    <main style="font-family:sans-serif;max-width:640px;margin:16px auto;padding:0 16px">
      <h1>開発用：ゲームの操作</h1>
      <p><button id="create">4チームのゲームを作って開始</button></p>
      <div id="game"></div>
    </main>`;
  const gameEl = root.querySelector<HTMLDivElement>('#game')!;

  root.querySelector('#create')!.addEventListener('click', async () => {
    const code = await createGame(db, uid, {
      config: defaultConfig(4, `dev-${Date.now()}`),
      teamNames: ['Aチーム', 'Bチーム', 'Cチーム', 'Dチーム'],
      timer: DEFAULT_TIMER,
      now: now(),
    });
    await startGame(db, code, now());
    showGame(code);
  });

  function showGame(code: string) {
    const teamUrl = `${location.origin}${location.pathname}#/team?code=${code}`;
    gameEl.innerHTML = `
      <p>ゲームコード：<strong style="font-size:1.5em">${code}</strong></p>
      <p>チーム画面：<a href="${teamUrl}" target="_blank">${teamUrl}</a></p>
      <p id="clock"></p>
      <p id="teams"></p>
      <p>
        <button id="close">締め切る</button>
        <button id="next">次の月へ</button>
        <button id="extend">＋30秒</button>
      </p>`;
    gameEl.querySelector('#close')!.addEventListener('click', () => closeCurrentMonth(db, code));
    gameEl.querySelector('#next')!.addEventListener('click', () => startNextMonth(db, code, now()));
    gameEl.querySelector('#extend')!.addEventListener('click', () => extendDeadline(db, code, 30));

    let teamNames: Record<string, string> = {};
    let joined: string[] = [];
    let submitted: string[] = [];
    let unsubSubmitted: (() => void) | null = null;
    const renderTeams = () => {
      gameEl.querySelector('#teams')!.textContent =
        `参加：${joined.map((id) => teamNames[id]).join('、') || 'なし'}　／　提出済み：${submitted.map((id) => teamNames[id]).join('、') || 'なし'}`;
    };
    watchTeams(db, code, (teams) => {
      teamNames = Object.fromEntries(Object.entries(teams).map(([id, t]) => [id, t.name]));
      joined = Object.entries(teams).filter(([, t]) => t.uid).map(([id]) => id);
      renderTeams();
    });
    watchClock(db, code, (clock) => {
      if (!clock) return;
      const left = Math.max(0, Math.round((clock.deadlineAt - now()) / 1000));
      gameEl.querySelector('#clock')!.textContent =
        `${clock.month}か月目・${clock.phase}${clock.phase === 'input' ? `（締切まで約${left}秒）` : ''}`;
      unsubSubmitted?.();
      unsubSubmitted = watchSubmitted(db, code, clock.month, (s) => { submitted = Object.keys(s); renderTeams(); });
    });
  }
}
