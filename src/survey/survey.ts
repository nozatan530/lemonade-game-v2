// ユーザーアンケート：回答の組み立てと送信。
// 送り先は GAS のウェブアプリ（gas/survey/）。スプレッドシートに1行ずつたまる。
// 個人を特定する情報は集めない（CLAUDE.md 開発ルール7）。自由記述には「名前や学校名は書かない」と添える。

export type Role = 'elementary' | 'junior' | 'high' | 'adult' | 'teacher';
export type Audience = 'child' | 'adult';

// 小学生は子ども向けの質問、中学生からは大人向けの質問
export const ROLES: { id: Role; label: string; audience: Audience }[] = [
  { id: 'elementary', label: '小学生', audience: 'child' },
  { id: 'junior', label: '中学生', audience: 'adult' },
  { id: 'high', label: '高校生', audience: 'adult' },
  { id: 'adult', label: '大人', audience: 'adult' },
  { id: 'teacher', label: '教育関係者', audience: 'adult' },
];

export const SCENES = ['小学校', '中学校', '高校', '大学・社会人研修', '家庭・その他'] as const;
export type Scene = (typeof SCENES)[number];

export type Difficulty = 'easy' | 'right' | 'hard';

export interface SurveyAnswers {
  fun: number; // 楽しさ 1〜5
  clarity: number; // わかりやすさ 1〜5
  difficulty: Difficulty;
  learning: number; // 原価・人件費がわかった（役立ちそう） 1〜5
  useInClass?: number; // 授業で使ってみたいか 1〜5（大人向けだけ）
  scenes?: Scene[]; // 使うとしたらどんな場面か（大人向けだけ）
  comment: string;
}

// 自動で付ける、遊んだゲームの情報（個人は特定しない）
export interface SurveyContext {
  source: 'solo-final' | 'top';
  pattern?: string;
  difficulty?: string;
  rank?: number;
  teams?: number;
  profit?: number;
  lang?: 'ja' | 'en'; // 答えた言語
}

export interface SurveyPayload {
  v: 1;
  role: Role;
  audience: Audience;
  answers: SurveyAnswers;
  context: SurveyContext & { device: 'phone' | 'tablet' | 'pc'; appVersion: string };
  hp: string; // いたずら対策（人には見えない欄。入っていたら送らない）
}

export const COMMENT_MAX = 1000;

const scale = (n: number) => Math.min(5, Math.max(1, Math.round(Number.isFinite(n) ? n : 3)));

// 回答を送れる形に整える（範囲外の値や長すぎる文字を直す）
export function buildPayload(input: {
  role: Role;
  answers: SurveyAnswers;
  context: SurveyContext;
  device: 'phone' | 'tablet' | 'pc';
  appVersion: string;
  hp?: string;
}): SurveyPayload {
  const audience = ROLES.find((r) => r.id === input.role)?.audience ?? 'adult';
  const a = input.answers;
  const answers: SurveyAnswers = {
    fun: scale(a.fun),
    clarity: scale(a.clarity),
    difficulty: (['easy', 'right', 'hard'] as const).includes(a.difficulty) ? a.difficulty : 'right',
    learning: scale(a.learning),
    comment: a.comment.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, COMMENT_MAX),
  };
  if (audience === 'adult') {
    if (a.useInClass !== undefined) answers.useInClass = scale(a.useInClass);
    answers.scenes = (a.scenes ?? []).filter((s): s is Scene => (SCENES as readonly string[]).includes(s));
  }
  return {
    v: 1,
    role: input.role,
    audience,
    answers,
    context: { ...input.context, device: input.device, appVersion: input.appVersion },
    hp: input.hp ?? '',
  };
}

// ---- 送信 ----

export function surveyEndpoint(): string {
  return (import.meta.env.VITE_SURVEY_ENDPOINT as string | undefined) ?? '';
}

// GAS には Content-Type: text/plain で JSON を送る（CORS のプリフライトを避けるため）
export async function sendSurvey(payload: SurveyPayload, endpoint = surveyEndpoint()): Promise<boolean> {
  if (!endpoint) return false;
  if (endpoint === 'mock') {
    // 開発中の確認用（どこにも送らない）
    console.info('[survey mock]', payload);
    return true;
  }
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const json = (await res.json()) as { ok?: boolean };
    return json.ok === true;
  } catch {
    return false;
  }
}

export function deviceType(): 'phone' | 'tablet' | 'pc' {
  const w = Math.min(window.screen.width, window.screen.height);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (coarse && w < 600) return 'phone';
  if (coarse) return 'tablet';
  return 'pc';
}

// 同じゲームで何度も送らないように、送ったことをブラウザに記録する
export function alreadySent(key: string): boolean {
  try {
    return localStorage.getItem(`lemonade-survey-sent:${key}`) === '1';
  } catch {
    return false;
  }
}

export function markSent(key: string): void {
  try {
    localStorage.setItem(`lemonade-survey-sent:${key}`, '1');
  } catch {
    // 何もしない
  }
}
