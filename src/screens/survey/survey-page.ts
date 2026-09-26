// 感想を送る（トップ画面から）
import { t } from '../../i18n';
import { bindLangToggle, langToggleHtml } from '../../ui/lang-toggle';
import { mountSurveyForm } from './survey-form';

export function renderSurveyPage(root: HTMLElement): () => void {
  const today = new Date().toISOString().slice(0, 10);
  root.innerHTML = `<div class="page">
    <div class="lang-bar">${langToggleHtml()}</div>
    <h1>${t('survey.page.h1')}</h1>
    <div class="card"><p style="margin-top:0">${t('survey.page.p')}</p><div id="survey"></div></div>
    <p class="center"><a href="#/">${t('common.backTop')}</a></p></div>`;
  bindLangToggle(root);
  // トップからの感想は1日に1回まで
  mountSurveyForm(root.querySelector('#survey')!, { source: 'top' }, `top-${today}`);
  return () => {};
}
