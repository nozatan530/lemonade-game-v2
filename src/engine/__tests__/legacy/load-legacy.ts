// 旧版（legacy/index.html）の計算関数を取り出して、テストの比較相手（オラクル）として動かす。
// 旧版のファイルは編集しない。画面や Firebase に触る部分はスタブに置き換える。

import legacyHtml from '../../../../legacy/index.html?raw';

// `function name(` から、対応する閉じ括弧までを切り出す
export function extractFunction(name: string): string {
  const start = legacyHtml.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`旧版に ${name} が見つかりません`);
  return extractBlock(start);
}

// `const name = {` のような宣言を切り出す
export function extractConst(name: string): string {
  const start = legacyHtml.indexOf(`const ${name} =`);
  if (start < 0) throw new Error(`旧版に ${name} が見つかりません`);
  return extractBlock(start) + ';';
}

function extractBlock(start: number): string {
  const open = legacyHtml.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < legacyHtml.length; i++) {
    const c = legacyHtml[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return legacyHtml.slice(start, i + 1);
    }
  }
  throw new Error('括弧が閉じていません');
}

export type LegacyG = any;

// 旧版の関数一式を、スタブ付きの閉じた環境で作る
export function createLegacy() {
  const src = [
    'seededRand', 'calcNextMonthValues', 'getScenarioMonth', 'calcMake',
    'runAuction', 'nextMonth', 'encodeKey',
  ].map(extractFunction).join('\n') + '\n' + extractConst('SCENARIOS');

  const factory = new Function(
    'env',
    `
    let G = null, SC = null;
    const dummy = { value: '', textContent: '', disabled: false, innerHTML: '' };
    const inputs = env.inputs;
    const document = { getElementById: (id) => (id in inputs ? inputs[id] : dummy) };
    const saveG = () => {}, renderResultTab = () => {}, tTab = () => {}, toast = () => {};
    const renderLinksArea = () => {}, renderInputTab = () => {}, showFinal = () => {};
    const generateForecast = () => null;
    ${src}
    return {
      seededRand, calcNextMonthValues, getScenarioMonth, calcMake, runAuction, nextMonth, SCENARIOS,
      getG: () => G, setG: (g) => { G = g; },
      setSC: (sc) => { SC = sc; },
    };
    `,
  );
  const inputs: Record<string, { value: string; textContent?: string; disabled?: boolean }> = {
    't-budget': { value: '0' },
  };
  const legacy = factory({ inputs });
  return {
    ...legacy,
    setBudget: (budget: number) => { inputs['t-budget']!.value = String(budget); },
    getBudget: () => parseInt(inputs['t-budget']!.value) || 0,
  } as {
    seededRand: (seed: string, n: number) => number;
    calcNextMonthValues: (month: number, G: LegacyG) => {
      marketBudget: number; costLemon: number; costSugar: number; costBarista: number;
    };
    getScenarioMonth: (month: number, G: LegacyG) => LegacyG;
    calcMake: (lemon: number, sugar: number, barista: number, C: LegacyG) => { maxMake: number };
    runAuction: () => void;
    nextMonth: () => void;
    SCENARIOS: LegacyG;
    getG: () => LegacyG;
    setG: (g: LegacyG) => void;
    setSC: (sc: LegacyG) => void;
    setBudget: (budget: number) => void;
    getBudget: () => number;
  };
}
