// Firebase の初期化。開発中（VITE_USE_EMULATOR=true）はローカルのエミュレーターにつなぐ。
// Web 用の設定値は公開前提の値なのでリポジトリに書いてよい（守りはセキュリティルールで行う）。

import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database';

// エミュレーター用（demo- で始まるプロジェクトは、本物のプロジェクトがなくても動く）
export const EMULATOR_CONFIG: FirebaseOptions = {
  apiKey: 'demo-key',
  authDomain: 'demo-lemonade.firebaseapp.com',
  projectId: 'demo-lemonade',
  databaseURL: 'https://demo-lemonade-default-rtdb.firebaseio.com',
};

// 本番用。Firebase プロジェクトを作ったら、コンソールの値に差し替える
export const PRODUCTION_CONFIG: FirebaseOptions = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  databaseURL: '',
  appId: '',
};

export interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  db: Database;
}

export function connectFirebase(options: {
  useEmulator: boolean;
  emulatorHost?: string; // スマホから開発機のエミュレーターにつなぐときは開発機の IP
  appName?: string; // テストで複数の利用者を作るとき
}): FirebaseHandles {
  const config = options.useEmulator ? EMULATOR_CONFIG : PRODUCTION_CONFIG;
  const app = initializeApp(config, options.appName);
  const auth = getAuth(app);
  const db = getDatabase(app);
  if (options.useEmulator) {
    const host = options.emulatorHost ?? '127.0.0.1';
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(db, host, 9000);
  }
  return { app, auth, db };
}

const handles = new Map<string, FirebaseHandles>();

// 役割ごとに1つだけ接続する（Spark プランの同時接続数を節約するため）。
// ログイン状態は役割ごとに別に保存されるので、同じブラウザで GM とチームを開いても混ざらない。
// 開発中は device を変えると、1つのブラウザで別の端末のふりができる（複数チームの確認用）。
export function firebase(role: 'gm' | 'team' | 'screen', device = ''): FirebaseHandles {
  const name = device ? `${role}-${device}` : role;
  let h = handles.get(name);
  if (!h) {
    const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';
    h = connectFirebase({ useEmulator, emulatorHost: location.hostname, appName: name });
    handles.set(name, h);
  }
  return h;
}
