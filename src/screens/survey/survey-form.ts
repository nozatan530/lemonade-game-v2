// アンケートの画面。最初に「あなたは？」を聞き、小学生なら子ども向け、中学生からは大人向けの質問に切り替える。

import {
  alreadySent, buildPayload, COMMENT_MAX, deviceType, markSent, ROLES, SCENES, sendSurvey, surveyEndpoint,
  type Audience, type Difficulty, type Role, type SurveyAnswers, type SurveyContext,
} from '../../survey/survey';
import { lang, t, type Key } from '../../i18n';
import { esc } from '../../ui/format';

const CHILD_FACES = ['😞', '🙁', '😐', '🙂', '😆'];

interface Question {
  key: 'fun' | 'clarity' | 'learning' | 'useInClass';
  adultOnly?: boolean;
}

const QUESTIONS: Question[] = [{ key: 'fun' }, { key: 'clarity' }, { key: 'learning' }, { key: 'useInClass', adultOnly: true }];

// 辞書のキー：survey.{質問}.{child|adult}、両端の説明は survey.{質問}.lo|hi.{child|adult}
const qText = (q: Question['key'], a: Audience) => t(`survey.${q}.${a}` as Key);
const qEnd = (q: Question['key'], end: 'lo' | 'hi', a: Audience) => t(`survey.${q}.${end}.${a}` as Key);
const aud = (base: string, a: Audience) => t(`${base}.${a}` as Key);

export function mountSurveyForm(container: HTMLElement, context: SurveyContext, sentKey: string): void {
  if (!surveyEndpoint()) {
    container.innerHTML = `<p class="muted">${t('survey.soon')}</p>`;
    return;
  }
  if (alreadySent(sentKey)) {
    container.innerHTML = `<p>${t('survey.thanksAlready')}</p>`;
    return;
  }

  let role: Role | null = null;
  const answers: Omit<Partial<SurveyAnswers>, 'scenes'> & { scenes: string[] } = { scenes: [] };

  const render = () => {
    const audience: Audience | null = role ? ROLES.find((r) => r.id === role)!.audience : null;
    const child = audience === 'child';
    container.innerHTML = `
      <div class="survey">
        <p class="survey-q">${t('survey.who')}</p>
        <div class="choice-row">${ROLES.map((r) => `<button type="button" class="choice ${role === r.id ? 'on' : ''}" data-role="${r.id}">${esc(t(`role.${r.id}` as Key))}</button>`).join('')}</div>
        ${audience ? `
          ${QUESTIONS.filter((q) => !q.adultOnly || audience === 'adult').map((q) => `
            <p class="survey-q">${esc(qText(q.key, audience))}</p>
            <div class="scale">
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="choice ${answers[q.key] === n ? 'on' : ''}" data-q="${q.key}" data-v="${n}"
                aria-label="${n}">${child ? CHILD_FACES[n - 1] : n}</button>`).join('')}
            </div>
            <div class="scale-ends"><span>${esc(qEnd(q.key, 'lo', audience))}</span><span>${esc(qEnd(q.key, 'hi', audience))}</span></div>`).join('')}
          <p class="survey-q">${aud('survey.diff', audience)}</p>
          <div class="choice-row">${(['easy', 'right', 'hard'] as Difficulty[]).map((v) => [v, aud(`survey.diff.${v}`, audience)] as [Difficulty, string])
            .map(([v, label]) => `<button type="button" class="choice ${answers.difficulty === v ? 'on' : ''}" data-diff="${v}">${label}</button>`).join('')}</div>
          ${audience === 'adult' ? `
            <p class="survey-q">${t('survey.scenes')}</p>
            <div class="choice-row">${SCENES.map((s) => `<button type="button" class="choice ${answers.scenes.includes(s) ? 'on' : ''}" data-scene="${esc(s)}">${esc(t(`scene.${s}` as Key))}</button>`).join('')}</div>` : ''}
          <p class="survey-q">${aud('survey.comment', audience)}</p>
          <textarea id="comment" rows="4" maxlength="${COMMENT_MAX}" placeholder="${esc(aud('survey.placeholder', audience))}">${esc(answers.comment ?? '')}</textarea>
          <input type="text" id="hp" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
          <p class="muted" id="missing" style="min-height:1.2em;margin:6px 0 0"></p>
          <button type="button" class="btn" id="send">${aud('survey.send', audience)}</button>
          <p class="muted" style="margin:6px 0 0">${aud('survey.note', audience)}</p>
        ` : ''}
      </div>`;
    bind();
  };

  const bind = () => {
    container.querySelectorAll<HTMLButtonElement>('[data-role]').forEach((b) => b.addEventListener('click', () => {
      role = b.dataset.role as Role;
      render();
    }));
    container.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) => b.addEventListener('click', () => {
      answers[b.dataset.q as Question['key']] = Number(b.dataset.v);
      keepComment();
      render();
    }));
    container.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) => b.addEventListener('click', () => {
      answers.difficulty = b.dataset.diff as Difficulty;
      keepComment();
      render();
    }));
    container.querySelectorAll<HTMLButtonElement>('[data-scene]').forEach((b) => b.addEventListener('click', () => {
      const s = b.dataset.scene!;
      answers.scenes = answers.scenes.includes(s) ? answers.scenes.filter((x) => x !== s) : [...answers.scenes, s];
      keepComment();
      render();
    }));
    container.querySelector('#send')?.addEventListener('click', submit);
  };

  const keepComment = () => {
    const t = container.querySelector<HTMLTextAreaElement>('#comment');
    if (t) answers.comment = t.value;
  };

  const submit = async () => {
    keepComment();
    if (!role) return;
    const audience = ROLES.find((r) => r.id === role)!.audience;
    const need: string[] = [];
    if (!answers.fun) need.push(aud('survey.short.fun', audience));
    if (!answers.clarity) need.push(aud('survey.short.clarity', audience));
    if (!answers.learning) need.push(aud('survey.short.learning', audience));
    if (audience === 'adult' && !answers.useInClass) need.push(t('survey.short.useInClass.adult'));
    if (!answers.difficulty) need.push(aud('survey.short.diff', audience));
    if (need.length) {
      container.querySelector('#missing')!.textContent = aud('survey.missing', audience).replace('{list}', need.join(t('survey.listSep')));
      return;
    }
    const btn = container.querySelector<HTMLButtonElement>('#send')!;
    btn.disabled = true;
    btn.textContent = t('survey.sending');
    const payload = buildPayload({
      role,
      answers: {
        fun: answers.fun!, clarity: answers.clarity!, learning: answers.learning!, difficulty: answers.difficulty!,
        ...(answers.useInClass ? { useInClass: answers.useInClass } : {}),
        scenes: answers.scenes as SurveyAnswers['scenes'],
        comment: answers.comment ?? '',
      },
      context: { ...context, lang: lang() },
      device: deviceType(),
      appVersion: __APP_VERSION__,
      hp: container.querySelector<HTMLInputElement>('#hp')?.value ?? '',
    });
    const ok = await sendSurvey(payload);
    if (ok) {
      markSent(sentKey);
      container.innerHTML = `<p>🙏 ${aud('survey.thanks', audience)}</p>`;
    } else {
      btn.disabled = false;
      btn.textContent = aud('survey.send', audience);
      container.querySelector('#missing')!.textContent = t('survey.failed');
    }
  };

  render();
}
