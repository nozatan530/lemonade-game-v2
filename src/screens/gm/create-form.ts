// 新しいゲームの設定フォーム

import { DEFAULT_TIMER, defaultConfig, MARKET_PATTERNS, MIN_BARISTA, withMarketPattern, withRandomMarketSize } from '../../engine/config';
import type { GameConfig, MarketPattern, TimerSettings } from '../../engine/types';
import { SOLO_DIFFICULTY, type SoloDifficulty } from '../../solo/local-game';

// むずかしさ：ソロと同じ3段階。市場の大きさ（1チームあたりの額）の幅だけを使う（対戦にロボット店長はいない）
const LEVELS: SoloDifficulty[] = ['easy', 'normal', 'hard'];
const LEVEL_NOTE: Record<SoloDifficulty, string> = {
  easy: 'お客さんが多め。売り切れやすく、はじめての人向け',
  normal: 'お客さんの数はゲームごとにちがう。値段の読み合いが起きる',
  hard: 'お客さんが少なめ。売れ残りやすく、競争がきびしい',
};
import { esc } from '../../ui/format';

// チームの名前（はじめの値）：頭文字が A〜L の動物。GM は自由に書きかえられる
const DEFAULT_NAMES = [
  '🐊 Alligator', '🐻 Bear', '🐱 Cat', '🐶 Dog', '🐘 Elephant', '🦊 Fox',
  '🦒 Giraffe', '🐴 Horse', '🦎 Iguana', '🐆 Jaguar', '🦘 Kangaroo', '🦁 Lion',
];

export interface CreateInput {
  config: GameConfig;
  teamNames: string[];
  timer: TimerSettings;
}

export function mountCreateForm(container: HTMLElement, onCreate: (input: CreateInput) => Promise<void>): void {
  const base = defaultConfig(4, '');
  container.innerHTML = `
    <div class="card">
      <h2>新しいゲームを作る</h2>
      <label class="field">チームの数
        <input type="number" id="teams" min="2" max="12" value="4"></label>
      <label class="field">チーム名（1行に1チーム）
        <textarea id="names" rows="4"></textarea></label>
      <label class="field">むずかしさ（お客さんが使うお金の多さ）
        <select id="level">
          ${LEVELS.map((l) => `<option value="${l}" ${l === 'normal' ? 'selected' : ''}>${esc(SOLO_DIFFICULTY[l].label)}：${LEVEL_NOTE[l]}</option>`).join('')}
        </select></label>
      <label class="field">市場のパターン（お客さんの数と材料の値段の動き方）
        <select id="pattern">
          ${(Object.keys(MARKET_PATTERNS) as MarketPattern[]).map((p) =>
            `<option value="${p}">${esc(MARKET_PATTERNS[p].label)}：${esc(MARKET_PATTERNS[p].description)}</option>`).join('')}
        </select></label>
      <label class="check" style="margin:0 0 12px"><input type="checkbox" id="baristaMonthly" checked>
        バリスタの人数を毎月決められるようにする（ソロと同じ。外すと3か月ごと）</label>
      <fieldset class="field"><legend>入力時間（秒）</legend>
        <div class="row3">
          <label>1か月目<input type="number" id="tFirst" min="30" value="${DEFAULT_TIMER.firstMonth}"></label>
          <label>4・7・10か月目<input type="number" id="tQuarter" min="30" value="${DEFAULT_TIMER.quarterStart}"></label>
          <label>そのほか<input type="number" id="tNormal" min="30" value="${DEFAULT_TIMER.normal}"></label>
        </div>
        <label class="check"><input type="checkbox" id="tAll"> 全チームが提出したら早めに締め切る</label>
      </fieldset>
      <details><summary>詳細設定</summary>
      <label class="field">市場の大きさ（お客さんが使うお金。1チームあたり）
        <select id="marketSize">
          <option value="level">むずかしさに合わせる（おすすめ）</option>
          <option value="20000">大きめ：20,000円（旧版と同じ。売り切れやすい）</option>
          <option value="15000">ふつう：15,000円</option>
          <option value="12000">小さめ：12,000円（競争がきびしい）</option>
        </select></label>
        <div class="row3">
          <label>はじめのお金<input type="number" id="fund" value="${base.startFund}"></label>
          <label>レモン（円/個）<input type="number" id="pLemon" value="${base.initialPrices.lemon}"></label>
          <label>砂糖（円/袋）<input type="number" id="pSugar" value="${base.initialPrices.sugar}"></label>
          <label>バリスタ（円/人・月）<input type="number" id="pBarista" value="${base.initialPrices.barista}"></label>
          <label>バリスタ1人の上限（杯）<input type="number" id="capacity" value="${base.baristaCapacity}"></label>
          <label>最初のバリスタ（人）<input type="number" id="initBarista" min="1" value="${base.initialBaristaCount}"></label>
          <label>シード（空欄なら自動）<input type="text" id="seed" placeholder="例：class-3a"></label>
        </div>
        <p class="muted">市場予算の基準は「チーム数 × 1チームあたりの額」。シードが同じなら、同じ市場の動きになります。</p>
      </details>
      <button class="btn" id="create">ゲームを作る</button>
    </div>`;

  const $ = <T extends HTMLElement>(id: string) => container.querySelector<T>(`#${id}`)!;
  const num = (id: string) => Number($<HTMLInputElement>(id).value);
  const teamsInput = $<HTMLInputElement>('teams');
  const namesInput = $<HTMLTextAreaElement>('names');

  const fillNames = () => {
    const n = Math.min(12, Math.max(2, num('teams') || 4));
    const current = namesInput.value.split('\n').map((s) => s.trim()).filter(Boolean);
    namesInput.value = Array.from({ length: n }, (_, i) => current[i] ?? DEFAULT_NAMES[i]).join('\n');
    namesInput.rows = n;
  };
  fillNames();
  teamsInput.addEventListener('change', fillNames);

  $('create').addEventListener('click', async () => {
    const names = namesInput.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12);
    if (names.length < 2) { alert('チームは2つ以上にしてください。'); return; }
    if (new Set(names).size !== names.length) { alert('チーム名が重なっています。'); return; }

    const seed = $<HTMLInputElement>('seed').value.trim() || `g${Date.now()}`;
    const marketSize = $<HTMLSelectElement>('marketSize').value;
    const perTeam = Number(marketSize);
    const level = $<HTMLSelectElement>('level').value as SoloDifficulty;
    const config = marketSize === 'level'
      ? withRandomMarketSize(defaultConfig(names.length, seed), names.length, SOLO_DIFFICULTY[level].market)
      : defaultConfig(names.length, seed);
    if (marketSize !== 'level') config.market = { ...config.market, base: perTeam * names.length, basePerTeam: perTeam };
    config.baristaCadence = $<HTMLInputElement>('baristaMonthly').checked ? 'monthly' : 'quarterly';
    // 市場のパターン（お客さんの数と材料の値段の動き方）を当てはめる
    Object.assign(config, withMarketPattern(config, $<HTMLSelectElement>('pattern').value as MarketPattern));
    config.market = { ...config.market, level };
    config.startFund = num('fund');
    config.initialPrices = { lemon: num('pLemon'), sugar: num('pSugar'), barista: num('pBarista') };
    config.baristaCapacity = num('capacity');
    config.initialBaristaCount = Math.max(MIN_BARISTA, num('initBarista'));

    const timer: TimerSettings = {
      firstMonth: num('tFirst'),
      quarterStart: num('tQuarter'),
      normal: num('tNormal'),
      closeWhenAllSubmitted: $<HTMLInputElement>('tAll').checked,
    };
    const btn = $<HTMLButtonElement>('create');
    btn.disabled = true;
    try {
      await onCreate({ config, teamNames: names, timer });
    } catch (e) {
      alert(`ゲームを作れませんでした：${(e as Error).message}`);
      btn.disabled = false;
    }
  });
}
