// 感想を送る（トップ画面から）
import { mountSurveyForm } from './survey-form';

export function renderSurveyPage(root: HTMLElement): () => void {
  const today = new Date().toISOString().slice(0, 10);
  root.innerHTML = `<div class="page">
    <h1>✉️ 感想を送る</h1>
    <div class="card"><p style="margin-top:0">遊んでみた感想を聞かせてください（1分くらい）。</p><div id="survey"></div></div>
    <p class="center"><a href="#/">トップにもどる</a></p></div>`;
  // トップからの感想は1日に1回まで
  mountSurveyForm(root.querySelector('#survey')!, { source: 'top' }, `top-${today}`);
  return () => {};
}
