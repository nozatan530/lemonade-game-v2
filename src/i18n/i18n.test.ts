import { afterEach, describe, expect, it } from 'vitest';
import { SEASON_NEWS } from '../engine/scenarios/seasonal';
import { monthLabel, monthShort } from '../ui/format';
import { newsText, soloTeamName } from './content';
import { en } from './en';
import { setLangForTest, t } from './index';
import { ja } from './ja';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLangForTest('ja'));

describe('辞書（日本語・英語）', () => {
  it('英語の辞書は、日本語の辞書と同じキーをすべて持つ（余分なキーもない）', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
  });

  it('置き換える場所（{name} など）が、日本語と英語で同じ', () => {
    for (const k of Object.keys(ja) as (keyof typeof ja)[]) {
      expect(placeholders(en[k]), k).toEqual(placeholders(ja[k]));
    }
  });

  it('英語の文に日本語の文字が残っていない（シーンの ID を除く）', () => {
    for (const [k, v] of Object.entries(en)) {
      if (k === 'lang.switch') continue; // 切り替えボタンは相手の言語で書く
      expect(/[ぁ-んァ-ン一-龥]/.test(v), `${k}: ${v}`).toBe(false);
    }
  });

  it('t() は params で置き換える', () => {
    setLangForTest('en');
    expect(t('input.cups', { n: 12 })).toBe('12 cups');
    setLangForTest('ja');
    expect(t('input.cups', { n: 12 })).toBe('12杯');
  });
});

describe('月の表示', () => {
  it('日本語：4月（1か月目）／英語：April (Month 1)', () => {
    expect(monthLabel(1, 4)).toBe('4月（1か月目）');
    expect(monthShort(10, 4)).toBe('1月');
    setLangForTest('en');
    expect(monthLabel(1, 4)).toBe('April (Month 1)');
    expect(monthShort(10, 4)).toBe('Jan');
  });
});

describe('engine の文の翻訳', () => {
  it('季節のお知らせは、暦の月に合った英語の文になる', () => {
    setLangForTest('en');
    expect(newsText(SEASON_NEWS[6]!)).toContain('Heat wave');
    expect(newsText('ほかのお知らせ')).toBe('ほかのお知らせ');
  });

  it('ソロのお店の名前は言語に合わせる', () => {
    expect(soloTeamName('t2')).toBe('🤖 Bスタンド');
    setLangForTest('en');
    expect(soloTeamName('t1')).toBe('Your stand');
    expect(soloTeamName('t3')).toBe('🤖 Stand C');
  });
});
