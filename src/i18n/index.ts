// 画面の言語（日本語・英語）。辞書は ja.ts / en.ts。
// はじめはブラウザの言語に合わせ（日本語以外は英語）、選んだ言語はブラウザに保存する。URL に ?lang=en / ?lang=ja でも指定できる。

import { en } from './en';
import { ja, type Key } from './ja';

export type Lang = 'ja' | 'en';
export type { Key };

const STORAGE_KEY = 'lemonade-lang';
const DICTS: Record<Lang, Record<Key, string>> = { ja, en };

function detect(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ja' || q === 'en') return q;
  } catch {
    // 何もしない
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ja' || saved === 'en') return saved;
  } catch {
    // 保存できない環境
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'ja';
  return nav.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

let current: Lang = typeof window !== 'undefined' ? detect() : 'ja';

export function lang(): Lang {
  return current;
}

export function setLang(next: Lang): void {
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // 保存できなくても、この画面の中では切り替わる
  }
  // URL に ?lang= があれば書きかえる（再読み込みしても選んだ言語のままにする）
  const url = new URL(location.href);
  if (url.searchParams.has('lang')) {
    url.searchParams.set('lang', next);
    history.replaceState(history.state, '', url);
  }
  applyDocumentLang();
  window.dispatchEvent(new Event('langchange'));
}

// テスト用
export function setLangForTest(next: Lang): void {
  current = next;
}

export function applyDocumentLang(): void {
  document.documentElement.lang = current;
  document.title = t('app.title');
}

// 辞書の文を返す。{name} の形の場所を params で置き換える（params の中身は呼ぶ側でエスケープする）
export function t(key: Key, params: Record<string, string | number> = {}): string {
  const s = DICTS[current][key] ?? ja[key];
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
}
