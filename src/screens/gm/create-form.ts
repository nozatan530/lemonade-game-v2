// 新しいゲームの設定フォーム

import { DEFAULT_TIMER, defaultConfig, MARKET_BASE_PER_TEAM } from '../../engine/config';
import { SCENARIOS } from '../../engine/scenarios';
import type { CostMode, GameConfig, ScenarioId, TimerSettings } from '../../engine/types';
import { esc } from '../../ui/format';

const DEFAULT_NAMES = 'ABCDEFGHIJKL'.split('').map((c) => `${c}チーム`);

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
      <label class="field">シナリオ（1年の市場の流れ）
        <select id="scenario">
          <option value="none">なし（毎月少しずつ変わる）</option>
          ${Object.entries(SCENARIOS).map(([id, sc]) => `<option value="${id}">${esc(sc.name)}：${esc(sc.desc)}</option>`).join('')}
        </select></label>
      <label class="field">原価の変わり方（シナリオなしのとき）
        <select id="costMode">
          <option value="fixed">変わらない</option>
          <option value="random">毎月ランダムに変わる</option>
          <option value="trend">だんだん上がる</option>
          <option value="shock">ときどき大きく変わる</option>
        </select></label>
      <fieldset class="field"><legend>入力時間（秒）</legend>
        <div class="row3">
          <label>1か月目<input type="number" id="tFirst" min="30" value="${DEFAULT_TIMER.firstMonth}"></label>
          <label>4・7・10か月目<input type="number" id="tQuarter" min="30" value="${DEFAULT_TIMER.quarterStart}"></label>
          <label>そのほか<input type="number" id="tNormal" min="30" value="${DEFAULT_TIMER.normal}"></label>
        </div>
        <label class="check"><input type="checkbox" id="tAll" checked> 全チームが提出したら早めに締め切る</label>
      </fieldset>
      <details><summary>詳細設定</summary>
        <div class="row3">
          <label>はじめのお金<input type="number" id="fund" value="${base.startFund}"></label>
          <label>レモン（円/個）<input type="number" id="pLemon" value="${base.initialPrices.lemon}"></label>
          <label>砂糖（円/袋）<input type="number" id="pSugar" value="${base.initialPrices.sugar}"></label>
          <label>バリスタ（円/人・月）<input type="number" id="pBarista" value="${base.initialPrices.barista}"></label>
          <label>バリスタ1人の上限（杯）<input type="number" id="capacity" value="${base.baristaCapacity}"></label>
          <label>最初のバリスタ（人）<input type="number" id="initBarista" min="0" value="${base.initialBaristaCount}"></label>
          <label>市場予算の変動（±%）<input type="number" id="range" value="${base.market.range}"></label>
          <label>原価の変動（±%）<input type="number" id="costRange" value="${base.market.costRange}"></label>
          <label>シード（空欄なら自動）<input type="text" id="seed" placeholder="例：class-3a"></label>
        </div>
        <p class="muted">市場予算の基準は「チーム数 × ${MARKET_BASE_PER_TEAM.toLocaleString()}円」。シードが同じなら、同じ市場の動きになります。</p>
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
    const config = defaultConfig(names.length, seed);
    config.scenario = $<HTMLSelectElement>('scenario').value as ScenarioId;
    config.market.costMode = $<HTMLSelectElement>('costMode').value as CostMode;
    config.market.range = num('range');
    config.market.costRange = num('costRange');
    config.startFund = num('fund');
    config.initialPrices = { lemon: num('pLemon'), sugar: num('pSugar'), barista: num('pBarista') };
    config.baristaCapacity = num('capacity');
    config.initialBaristaCount = num('initBarista');

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
