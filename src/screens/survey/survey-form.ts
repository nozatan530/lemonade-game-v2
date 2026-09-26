// アンケートの画面。最初に「あなたは？」を聞き、小学生なら子ども向け、中学生からは大人向けの質問に切り替える。

import {
  alreadySent, buildPayload, COMMENT_MAX, deviceType, markSent, ROLES, SCENES, sendSurvey, surveyEndpoint,
  type Audience, type Difficulty, type Role, type SurveyAnswers, type SurveyContext,
} from '../../survey/survey';
import { esc } from '../../ui/format';

const CHILD_FACES = ['😞', '🙁', '😐', '🙂', '😆'];

interface Question {
  key: 'fun' | 'clarity' | 'learning' | 'useInClass';
  text: Record<Audience, string>;
  ends: Record<Audience, [string, string]>;
  adultOnly?: boolean;
}

const QUESTIONS: Question[] = [
  { key: 'fun', text: { child: 'たのしかった？', adult: '楽しさ' }, ends: { child: ['ぜんぜん', 'とても'], adult: ['つまらない', 'とても楽しい'] } },
  { key: 'clarity', text: { child: 'あそびかたはわかった？', adult: 'ルールのわかりやすさ' }, ends: { child: ['わからない', 'よくわかった'], adult: ['わかりにくい', 'とてもわかりやすい'] } },
  { key: 'learning', text: { child: '「原価（ざいりょうのおかね）」や「人件費（きゅうりょう）」のことがわかった？', adult: '原価・人件費・利益の関係を理解するのに役立ちそうか' }, ends: { child: ['わからない', 'よくわかった'], adult: ['役立たない', 'とても役立つ'] } },
  { key: 'useInClass', adultOnly: true, text: { child: '', adult: '授業やワークショップで使ってみたいか（使われたらうれしいか）' }, ends: { child: ['', ''], adult: ['使いたくない', 'ぜひ使いたい'] } },
];

export function mountSurveyForm(container: HTMLElement, context: SurveyContext, sentKey: string): void {
  if (!surveyEndpoint()) {
    container.innerHTML = '<p class="muted">アンケートは準備中です。</p>';
    return;
  }
  if (alreadySent(sentKey)) {
    container.innerHTML = '<p>🙏 感想をありがとうございました！</p>';
    return;
  }

  let role: Role | null = null;
  const answers: Omit<Partial<SurveyAnswers>, 'scenes'> & { scenes: string[] } = { scenes: [] };

  const render = () => {
    const audience: Audience | null = role ? ROLES.find((r) => r.id === role)!.audience : null;
    const child = audience === 'child';
    container.innerHTML = `
      <div class="survey">
        <p class="survey-q">あなたは？</p>
        <div class="choice-row">${ROLES.map((r) => `<button type="button" class="choice ${role === r.id ? 'on' : ''}" data-role="${r.id}">${r.label}</button>`).join('')}</div>
        ${audience ? `
          ${QUESTIONS.filter((q) => !q.adultOnly || audience === 'adult').map((q) => `
            <p class="survey-q">${esc(q.text[audience])}</p>
            <div class="scale">
              ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="choice ${answers[q.key] === n ? 'on' : ''}" data-q="${q.key}" data-v="${n}"
                aria-label="${n}">${child ? CHILD_FACES[n - 1] : n}</button>`).join('')}
            </div>
            <div class="scale-ends"><span>${esc(q.ends[audience][0])}</span><span>${esc(q.ends[audience][1])}</span></div>`).join('')}
          <p class="survey-q">${child ? 'むずかしさは？' : '難しさ'}</p>
          <div class="choice-row">${([['easy', child ? 'かんたんすぎ' : '易しすぎ'], ['right', child ? 'ちょうどいい' : 'ちょうどよい'], ['hard', child ? 'むずかしすぎ' : '難しすぎ']] as [Difficulty, string][])
            .map(([v, label]) => `<button type="button" class="choice ${answers.difficulty === v ? 'on' : ''}" data-diff="${v}">${label}</button>`).join('')}</div>
          ${audience === 'adult' ? `
            <p class="survey-q">使うとしたら、どんな場面ですか（いくつでも）</p>
            <div class="choice-row">${SCENES.map((s) => `<button type="button" class="choice ${answers.scenes.includes(s) ? 'on' : ''}" data-scene="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
          <p class="survey-q">${child ? 'ひとこと（なんでもどうぞ）' : '感想・改善してほしいこと（自由にどうぞ）'}</p>
          <textarea id="comment" rows="4" maxlength="${COMMENT_MAX}" placeholder="${child ? 'なまえや学校の名前は書かないでね' : 'お名前や学校名など、個人がわかることは書かないでください'}">${esc(answers.comment ?? '')}</textarea>
          <input type="text" id="hp" tabindex="-1" autocomplete="off" class="hp" aria-hidden="true">
          <p class="muted" id="missing" style="min-height:1.2em;margin:6px 0 0"></p>
          <button type="button" class="btn" id="send">${child ? 'おくる' : '送信する'}</button>
          <p class="muted" style="margin:6px 0 0">${child ? 'こたえは、このゲームをよくするために使います。' : '回答は、このゲームの改善のためだけに使います。個人を特定する情報は集めていません。'}</p>
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
    if (!answers.fun) need.push(audience === 'child' ? 'たのしかった？' : '楽しさ');
    if (!answers.clarity) need.push(audience === 'child' ? 'あそびかた' : 'わかりやすさ');
    if (!answers.learning) need.push(audience === 'child' ? '原価・人件費' : '理解に役立つか');
    if (audience === 'adult' && !answers.useInClass) need.push('授業で使いたいか');
    if (!answers.difficulty) need.push(audience === 'child' ? 'むずかしさ' : '難しさ');
    if (need.length) {
      container.querySelector('#missing')!.textContent = `${audience === 'child' ? 'まだ答えていない質問があるよ' : '未回答の質問があります'}：${need.join('・')}`;
      return;
    }
    const btn = container.querySelector<HTMLButtonElement>('#send')!;
    btn.disabled = true;
    btn.textContent = '送信中…';
    const payload = buildPayload({
      role,
      answers: {
        fun: answers.fun!, clarity: answers.clarity!, learning: answers.learning!, difficulty: answers.difficulty!,
        ...(answers.useInClass ? { useInClass: answers.useInClass } : {}),
        scenes: answers.scenes as SurveyAnswers['scenes'],
        comment: answers.comment ?? '',
      },
      context,
      device: deviceType(),
      appVersion: __APP_VERSION__,
      hp: container.querySelector<HTMLInputElement>('#hp')?.value ?? '',
    });
    const ok = await sendSurvey(payload);
    if (ok) {
      markSent(sentKey);
      container.innerHTML = `<p>🙏 ${audience === 'child' ? 'ありがとう！ こたえをうけとりました。' : 'ご協力ありがとうございました！ 回答を受け付けました。'}</p>`;
    } else {
      btn.disabled = false;
      btn.textContent = '送信する';
      container.querySelector('#missing')!.textContent = '送れませんでした。通信を確かめて、もう一度おしてください。';
    }
  };

  render();
}
