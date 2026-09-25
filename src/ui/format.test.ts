import { describe, expect, it } from 'vitest';
import { calendarMonth, esc, mmss, monthLabel, secondsLeft, yen } from './format';

describe('format', () => {
  it('4月始まりなら1か月目は4月、10か月目は1月', () => {
    expect(calendarMonth(1, 4)).toBe(4);
    expect(calendarMonth(9, 4)).toBe(12);
    expect(calendarMonth(10, 4)).toBe(1);
    expect(monthLabel(1, 4)).toBe('4月（1か月目）');
  });

  it('金額と時間', () => {
    expect(yen(12345)).toBe('¥12,345');
    expect(yen(-500)).toBe('−¥500');
    expect(mmss(95)).toBe('1:35');
    expect(secondsLeft(10_500, 10_000)).toBe(1);
    expect(secondsLeft(9_000, 10_000)).toBe(0);
  });

  it('HTML をエスケープする', () => {
    expect(esc('<b>"A"&</b>')).toBe('&lt;b&gt;&quot;A&quot;&amp;&lt;/b&gt;');
  });
});
