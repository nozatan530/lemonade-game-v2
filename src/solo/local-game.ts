// ソロモード：人1チーム vs CPU 3チームを、ブラウザの中だけで進める（Firebase は使わない）。
// オンラインの sync にあたる役。計算は engine の関数に任せ、ここは状態を持って順に呼ぶだけ。

import { canChangeBarista, defaultConfig, withMarketPattern, withRandomMarketSize, type MarketSizeRange } from '../engine/config';
import { CPU_TYPES, cpuViewOf, decideCpu } from '../engine/cpu-teams';
import { closeMonth, openNextMonth, startTerm } from '../engine/month';
import { seededRand } from '../engine/random';
import type {
  CpuSkill, CpuType, GameConfig, MarketPattern, MonthConditions, MonthlyDecision, MonthResult, Submission, TeamState,
} from '../engine/types';

export const HUMAN_ID = 't1';
const CPU_IDS = ['t2', 't3', 't4'] as const;
const STORAGE_KEY = 'lemonade-solo-v1';

export type SoloDifficulty = 'easy' | 'normal' | 'hard';

// 難易度：市場の大きさ（1チームあたりの額の幅）と CPU の強さ。数値は src/solo/balance.test.ts で確かめて決めた
export const SOLO_DIFFICULTY: Record<SoloDifficulty, { label: string; description: string; market: MarketSizeRange; cpuSkill: CpuSkill }> = {
  easy: { label: 'やさしい', description: 'お客さんが多め。CPU は作戦どおりに動くだけ', market: { min: 17000, max: 22000 }, cpuSkill: 'basic' },
  normal: { label: 'ふつう', description: 'お客さんの数はゲームごとにちがう。CPU は先月の結果を見て作戦を変える', market: { min: 12000, max: 17000 }, cpuSkill: 'adaptive' },
  hard: { label: 'むずかしい', description: 'お客さんが少なめ。CPU は先月の結果を見て作戦を変える', market: { min: 10000, max: 14000 }, cpuSkill: 'adaptive' },
};

export interface SoloState {
  version: 1;
  difficulty?: SoloDifficulty; // 古い保存データにはない（そのときは「やさしい」と同じ動き）
  config: GameConfig;
  names: Record<string, string>;
  cpu: Record<string, CpuType>; // どの店がどの作戦か（期末に明かす）
  teams: TeamState[];
  conditions: MonthConditions; // いまの月の条件（結果・期末でも最後の月のまま持つ）
  results: MonthResult[];
  decided: Record<string, MonthlyDecision>; // 先月の実際の決定
  phase: 'input' | 'result' | 'final';
}

export function newSoloGame(options: {
  seed: string;
  pattern?: MarketPattern; // 市場のパターン（初期値：変動なし）
  difficulty?: SoloDifficulty;
}): SoloState {
  const difficulty = options.difficulty ?? 'normal';
  // お客さんの数（市場の大きさ）はゲームごとにランダム。幅は難易度で決まる。動き方は市場のパターンで決まる
  const config = withMarketPattern(
    withRandomMarketSize(defaultConfig(4, options.seed), 4, SOLO_DIFFICULTY[difficulty].market),
    options.pattern ?? 'stable',
  );
  // ソロはタイマーがないので、バリスタの人数を毎月決められる
  config.baristaCadence = 'monthly';

  // 4つの作戦から3つを選び、どの店に割り当てるかもシードで決める（毎回ちがう並び）。
  // 「ふつう」「むずかしい」では安売りを必ず入れる（いないと、何も考えなくても勝ててしまうため）
  const pool = difficulty === 'easy' ? [...CPU_TYPES] : CPU_TYPES.filter((t) => t !== 'discount');
  const picked = [...pool]
    .map((type, i) => ({ type, key: seededRand(`${options.seed}:cpu-pick`, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.type)
    .slice(0, difficulty === 'easy' ? 3 : 2);
  const shuffled = [...picked, ...(difficulty === 'easy' ? [] : ['discount' as const])]
    .map((type, i) => ({ type, key: seededRand(`${options.seed}:cpu-assign`, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.type);
  const cpu: Record<string, CpuType> = {};
  CPU_IDS.forEach((id, i) => { cpu[id] = shuffled[i]!; });

  const names: Record<string, string> = { t1: 'あなたのお店', t2: 'Bスタンド', t3: 'Cスタンド', t4: 'Dスタンド' };
  const { teams, conditions } = startTerm(config, Object.entries(names).map(([teamId, name]) => ({ teamId, name })));
  return { version: 1, difficulty, config, names, cpu, teams, conditions, results: [], decided: {}, phase: 'input' };
}

// 人の決定を受け取り、CPU の決定と合わせて1か月を締め切る
export function submitHuman(state: SoloState, decision: MonthlyDecision, baristaCount?: number): SoloState {
  if (state.phase !== 'input') return state;
  const c = state.conditions;
  const seed = state.config.market.seed;

  const human: Submission = {
    teamId: HUMAN_ID,
    monthlyDecision: decision,
    ...(canChangeBarista(c.month, state.config.baristaCadence) && baristaCount !== undefined ? { quarterlyDecision: { baristaCount } } : {}),
    order: 0,
  };
  const cpuSubs: Submission[] = state.teams
    .filter((t) => t.teamId !== HUMAN_ID)
    .map((t) => {
      const view = cpuViewOf({
        month: c.month,
        prices: c.prices,
        rules: { baristaCapacity: state.config.baristaCapacity, recipe: state.config.recipe, teamCount: state.teams.length },
        me: t,
        results: state.results,
        baristaCadence: state.config.baristaCadence,
      });
      const dice = (k: number) => seededRand(`${seed}:cpu:${t.teamId}`, c.month * 100 + k);
      const skill = SOLO_DIFFICULTY[state.difficulty ?? 'easy'].cpuSkill;
      return { teamId: t.teamId, ...decideCpu(state.cpu[t.teamId]!, view, dice, skill), order: 0 };
    });

  // 提出順（同じ値段のときの端数の順番）は毎月シードで決める。人がいつも先になると有利すぎるため
  const subs = [human, ...cpuSubs]
    .map((s, i) => ({ s, key: seededRand(`${seed}:order`, c.month * 100 + i) }))
    .sort((a, b) => a.key - b.key)
    .map(({ s }, i) => ({ ...s, order: i + 1 }));

  const r = closeMonth(state.config, state.teams, c, subs, state.decided);
  return { ...state, teams: r.teams, decided: r.decided, results: [...state.results, r.result], phase: 'result' };
}

// 次の月へ。最終月の後なら期末にする
export function nextSoloMonth(state: SoloState): SoloState {
  if (state.phase !== 'result') return state;
  const last = state.results[state.results.length - 1];
  const next = openNextMonth(state.config, state.conditions.month, state.teams.length, last?.prices ?? state.conditions.prices);
  if (!next) return { ...state, phase: 'final' };
  return { ...state, conditions: next, phase: 'input' };
}

// 入力欄の初期値にする、人の先月の決定
export function lastHumanDecision(state: SoloState): MonthlyDecision | null {
  return state.decided[HUMAN_ID] ?? null;
}

// ---- ブラウザへの保存（その端末だけ。使えないときは保存しないで遊べる） ----

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function saveSolo(state: SoloState, storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても遊べる（プライベートブラウズなど）
  }
}

export function loadSolo(storage: KeyValueStorage | null = defaultStorage()): SoloState | null {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SoloState;
    if (s.version !== 1 || !Array.isArray(s.teams) || !s.conditions) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSolo(storage: KeyValueStorage | null = defaultStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    // 何もしない
  }
}
