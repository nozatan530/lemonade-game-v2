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

let handles: FirebaseHandles | null = null;

// アプリ全体で1つだけ接続する（Spark プランの同時接続数を節約するため）
export function firebase(): FirebaseHandles {
  if (!handles) {
    const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true';
    handles = connectFirebase({ useEmulator, emulatorHost: location.hostname });
  }
  return handles;
}
