// 言語の切り替えボタン（日本語 ⇄ English）
import { lang, setLang, t } from '../i18n';

export function langToggleHtml(): string {
  return `<button type="button" class="small lang-toggle" data-lang-toggle aria-label="Language / 言語">🌐 ${t('lang.switch')}</button>`;
}

export function bindLangToggle(root: HTMLElement): void {
  root.querySelectorAll<HTMLButtonElement>('[data-lang-toggle]').forEach((b) =>
    b.addEventListener('click', () => setLang(lang() === 'ja' ? 'en' : 'ja')));
}
