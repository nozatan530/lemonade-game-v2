import { describe, expect, it } from 'vitest';
import gasSource from '../../gas/survey/Code.gs?raw';
import { buildPayload, COMMENT_MAX, type SurveyAnswers } from './survey';

// GAS のコード（gas/survey/Code.gs）をそのまま動かして、保存する行を確かめる
const gas = new Function(`${gasSource}; return { toRow_ };`)() as { toRow_: (d: unknown, now: Date) => unknown[] | null };

const answers: SurveyAnswers = { fun: 5, clarity: 4, difficulty: 'right', learning: 3, useInClass: 4, scenes: ['中学校'], comment: 'たのしかった' };
const build = (over: Partial<Parameters<typeof buildPayload>[0]> = {}) => buildPayload({
  role: 'teacher', answers, context: { source: 'solo-final', pattern: 'realistic', difficulty: 'normal', rank: 2, teams: 4, profit: 45000 },
  device: 'pc', appVersion: 'test', ...over,
});

describe('buildPayload（アンケートの回答を整える）', () => {
  it('小学生は子ども向け、中学生からは大人向け', () => {
    expect(build({ role: 'elementary' }).audience).toBe('child');
    for (const role of ['junior', 'high', 'adult', 'teacher'] as const) expect(build({ role }).audience).toBe('adult');
  });

  it('子ども向けでは、授業で使いたいか・使う場面は送らない', () => {
    const p = build({ role: 'elementary' });
    expect(p.answers.useInClass).toBeUndefined();
    expect(p.answers.scenes).toBeUndefined();
  });

  it('範囲外の数・長すぎる文・決まっていない場面は直す', () => {
    const p = build({ answers: { ...answers, fun: 9, clarity: 0, learning: Number.NaN, scenes: ['中学校', 'ハッキング' as never], comment: 'あ'.repeat(3000) } });
    expect(p.answers.fun).toBe(5);
    expect(p.answers.clarity).toBe(1);
    expect(p.answers.learning).toBe(3);
    expect(p.answers.scenes).toEqual(['中学校']);
    expect(p.answers.comment.length).toBe(COMMENT_MAX);
  });
});

describe('GAS：スプレッドシートに保存する行（toRow_）', () => {
  const now = new Date('2026-09-26T10:00:00+09:00');

  it('正しい回答は1行になる（日本語のラベルで保存）', () => {
    const row = gas.toRow_(JSON.parse(JSON.stringify(build())), now)!;
    expect(row[1]).toBe('教育関係者');
    expect(row.slice(2, 8)).toEqual([5, 4, 'ちょうどいい', 3, 4, '中学校']);
    expect(row[8]).toBe('たのしかった');
    expect(row.slice(9, 15)).toEqual(['solo-final', 'realistic', 'normal', 2, 4, 45000]);
  });

  it('子どもの回答（授業で使いたいか・場面なし）も保存できる', () => {
    const row = gas.toRow_(JSON.parse(JSON.stringify(build({ role: 'elementary' }))), now)!;
    expect(row[1]).toBe('小学生');
    expect(row[6]).toBe('');
    expect(row[7]).toBe('');
  });

  it('いたずら対策の欄に入力があれば保存しない', () => {
    expect(gas.toRow_({ ...build(), hp: 'bot' }, now)).toBeNull();
  });

  it('決まっていない回答者・範囲外の数・知らない形式は保存しない', () => {
    expect(gas.toRow_({ ...build(), role: 'hacker' }, now)).toBeNull();
    expect(gas.toRow_({ ...build(), answers: { ...answers, fun: 7 } }, now)).toBeNull();
    expect(gas.toRow_({ ...build(), answers: { ...answers, difficulty: 'unknown' } }, now)).toBeNull();
    expect(gas.toRow_({ ...build(), v: 2 }, now)).toBeNull();
    expect(gas.toRow_(null, now)).toBeNull();
  });

  it('スプレッドシートの式として動かないように、= + - @ で始まる文には \' を付ける', () => {
    const row = gas.toRow_({ ...build(), answers: { ...answers, comment: '=HYPERLINK("http://example.com")' } }, now)!;
    expect(row[8]).toBe('\'=HYPERLINK("http://example.com")');
  });

  it('コメントは1000文字まで', () => {
    const row = gas.toRow_({ ...build(), answers: { ...answers, comment: 'あ'.repeat(2000) } }, now)!;
    expect((row[8] as string).length).toBe(1000);
  });
});
