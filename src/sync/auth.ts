// ログイン。GM は Google、販売チームと全体表示は匿名認証。

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup, signOut, type Auth, type User,
} from 'firebase/auth';

export async function signInAsTeam(auth: Auth): Promise<User> {
  if (auth.currentUser) return auth.currentUser; // 読み込み直しても同じ uid のまま
  return (await signInAnonymously(auth)).user;
}

export async function signInAsGm(auth: Auth): Promise<User> {
  if (auth.currentUser && !auth.currentUser.isAnonymous) return auth.currentUser;
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}

export async function signOutUser(auth: Auth): Promise<void> {
  await signOut(auth);
}

// 保存されたログイン状態の復元を待つ
export function waitForAuth(auth: Auth): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}

// 開発用（エミュレーター接続時だけ使う）：テスト用の GM アカウントでログイン
export async function signInAsDevGm(auth: Auth): Promise<User> {
  const email = 'dev-gm@example.com';
  const password = 'dev-password';
  const cred = await signInWithEmailAndPassword(auth, email, password)
    .catch(() => createUserWithEmailAndPassword(auth, email, password));
  return cred.user;
}
