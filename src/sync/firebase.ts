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

// 本番用（Firebase プロジェクト lemonade-game-v2）
export const PRODUCTION_CONFIG: FirebaseOptions = {
  apiKey: 'AIzaSyDCCsA07wrveBGW4Rhev3LBLRedjvdiBok',
  authDomain: 'lemonade-game-v2.firebaseapp.com',
  databaseURL: 'https://lemonade-game-v2-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'lemonade-game-v2',
  storageBucket: 'lemonade-game-v2.firebasestorage.app',
  messagingSenderId: '597316515204',
  appId: '1:597316515204:web:579bc8eab9728196a199d1',
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

// エミュレーターだけ：GM に許可する（本番では Firebase コンソールで gmAllow/{uid} = true を登録する）。
// ルールを通さない管理者の書き込み（Authorization: Bearer owner）はエミュレーターでしか使えない
export async function allowGmInEmulator(uid: string, host = '127.0.0.1'): Promise<void> {
  const ns = new URL(EMULATOR_CONFIG.databaseURL!).hostname.split('.')[0];
  const res = await fetch(`http://${host}:9000/gmAllow/${uid}.json?ns=${ns}`, {
    method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: 'true',
  });
  if (!res.ok) throw new Error(`GM の許可を登録できませんでした（${res.status}）`);
}
