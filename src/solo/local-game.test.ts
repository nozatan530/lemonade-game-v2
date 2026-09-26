import { describe, expect, it } from 'vitest';
import { CPU_TYPES } from '../engine/cpu-teams';
import {
  clearSolo, HUMAN_ID, lastHumanDecision, loadSolo, newSoloGame, nextSoloMonth, saveSolo, submitHuman, type SoloState,
} from './local-game';

const start = (seed = 'solo') => newSoloGame({ seed });
const decision = { lemonQty: 50, sugarQty: 50, price: 250 };

function playAll(state: SoloState): SoloState {
  let s = state;
  while (s.phase !== 'final') {
    s = s.phase === 'input' ? submitHuman(s, decision, 1) : nextSoloMonth(s);
  }
  return s;
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

describe('ソロモードの進行', () => {
  it('人1チームと CPU 3チームで始まる。CPU の作戦は4つから3つ、店の名前からは作戦がわからない', () => {
    const s = start();
    expect(s.teams.map((t) => t.teamId)).toEqual(['t1', 't2', 't3', 't4']);
    const types = Object.values(s.cpu);
    expect(new Set(types).size).toBe(3);
    for (const t of types) expect(CPU_TYPES).toContain(t);
    expect(Object.values(s.names).join()).not.toMatch(/安売り|高値|追随|慎重/);
  });

  it('シードが同じなら、作戦の割り当ても結果も同じ', () => {
    expect(playAll(start('same'))).toEqual(playAll(start('same')));
  });

  it('シードが違えば、作戦の割り当ても変わる', () => {
    const patterns = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => JSON.stringify(start(seed).cpu)));
    expect(patterns.size).toBeGreaterThan(1);
  });

  it('提出 → 結果 → 次の月 を12回くり返して期末になる', () => {
    let s = start();
    expect(s.phase).toBe('input');
    s = submitHuman(s, decision, 1);
    expect(s.phase).toBe('result');
    expect(s.results).toHaveLength(1);
    s = nextSoloMonth(s);
    expect(s.phase).toBe('input');
    expect(s.conditions.month).toBe(2);

    const end = playAll(start());
    expect(end.phase).toBe('final');
    expect(end.results).toHaveLength(12);
    for (const r of end.results) expect(r.teamResults.map((t) => t.teamId)).toContain(HUMAN_ID);
  });

  it('ソロでは、人のバリスタ人数を毎月変えられる', () => {
    let s = submitHuman(start(), decision, 2); // 1か月目
    expect(s.teams[0]!.baristaCount).toBe(2);
    s = submitHuman(nextSoloMonth(s), decision, 3); // 2か月目も変えられる
    expect(s.teams[0]!.baristaCount).toBe(3);
    expect(s.config.baristaCadence).toBe('monthly');
  });

  it('先月の自分の決定を返す（入力欄の初期値用）', () => {
    const s = submitHuman(start(), { lemonQty: 30, sugarQty: 40, price: 180, maxSell: 20 }, 1);
    expect(lastHumanDecision(s)).toEqual({ lemonQty: 30, sugarQty: 40, price: 180, maxSell: 20 });
  });

  it('入力中でないときの提出や、結果の前の「次の月へ」は何もしない', () => {
    const s = start();
    expect(nextSoloMonth(s)).toBe(s);
    const r = submitHuman(s, decision, 1);
    expect(submitHuman(r, decision, 1)).toBe(r);
  });
});

describe('ブラウザへの保存', () => {
  it('保存して読み込むと同じ状態に戻る', () => {
    const storage = memoryStorage();
    const s = submitHuman(start(), decision, 1);
    saveSolo(s, storage);
    expect(loadSolo(storage)).toEqual(s);
    clearSolo(storage);
    expect(loadSolo(storage)).toBeNull();
  });

  it('壊れたデータや古い形式は読み込まない', () => {
    const storage = memoryStorage();
    storage.setItem('lemonade-solo-v1', '{broken');
    expect(loadSolo(storage)).toBeNull();
    storage.setItem('lemonade-solo-v1', JSON.stringify({ version: 0 }));
    expect(loadSolo(storage)).toBeNull();
  });

  it('保存できない環境（プライベートブラウズなど）でもエラーにならない', () => {
    const broken = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(() => saveSolo(start(), broken)).not.toThrow();
    expect(loadSolo(broken)).toBeNull();
    expect(() => clearSolo(broken)).not.toThrow();
    expect(loadSolo(null)).toBeNull();
  });
});
