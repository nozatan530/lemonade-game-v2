import { describe, expect, it } from 'vitest';
import { gmNote, type NoteInput } from './facilitation';

const base: NoteInput = { phase: 'input', month: 2, months: 12, quarterStart: false, seasonal: false, calendarMonth: 5 };

describe('GM の進行メモ', () => {
  it('段階ごとに見出しと話すことが出る', () => {
    for (const phase of ['lobby', 'input', 'result', 'final'] as const) {
      const n = gmNote({ ...base, phase });
      expect(n.title).not.toBe('');
      expect(n.points.length).toBeGreaterThan(0);
      expect(n.points.length).toBeLessThanOrEqual(4);
    }
  });

  it('バリスタを決める月・折り返し・最後の月に、それぞれの話題が入る', () => {
    expect(gmNote({ ...base, quarterStart: true }).points.join()).toContain('バリスタ');
    // 毎月決めるときは、毎月「決める月です」とは言わない
    expect(gmNote({ ...base, quarterStart: true, baristaMonthly: true }).points.join()).not.toContain('決める月');
    expect(gmNote({ ...base, month: 6 }).points.join()).toContain('折り返し');
    expect(gmNote({ ...base, month: 12 }).points.join()).toContain('最後の月');
  });

  it('2年以上：年の決算と、次の年の1か月目の話題', () => {
    const y = gmNote({ ...base, phase: 'yearEnd', month: 12, months: 36 });
    expect(y.title).toContain('第1期の決算');
    expect(y.points.join()).toContain('第2期を始める');
    expect(gmNote({ ...base, month: 13, months: 36 }).title).toContain('第2期');
    expect(gmNote({ ...base, month: 12, months: 36 }).points.join()).toContain('第1期の最後の月');
    expect(gmNote({ ...base, month: 18, months: 36 }).points.join()).toContain('折り返し');
  });

  it('季節の話題は、お客さんの数が季節で変わるときだけ', () => {
    expect(gmNote({ ...base, calendarMonth: 7 }).points.join()).not.toContain('夏');
    expect(gmNote({ ...base, calendarMonth: 7, seasonal: true }).points.join()).toContain('夏');
  });
});
