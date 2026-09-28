// ソロモード：人1チーム vs CPU（2〜7チーム。初期値3チーム）を、ブラウザの中だけで進める（Firebase は使わない）。
// オンラインの sync にあたる役。計算は engine の関数に任せ、ここは状態を持って順に呼ぶだけ。

import { canChangeBarista, defaultConfig, withMarketPattern, withRandomMarketSize, type MarketSizeRange } from '../engine/config';
import { CPU_TYPES, cpuViewOf, decideCpu } from '../engine/cpu-teams';
import { closeMonth, isActive, openNextMonth, startTerm } from '../engine/month';
import { seededRand } from '../engine/random';
import { isYearEnd, MAX_YEARS, MONTHS_PER_YEAR } from '../engine/years';
import type {
  CpuSkill, CpuType, GameConfig, MarketPattern, MonthConditions, MonthlyDecision, MonthResult, Submission, TeamState,
} from '../engine/types';

export const HUMAN_ID = 't1';
// お店の数（あなたを含む）。初期値は4（あなた＋ロボット店長3店）
export const SOLO_TEAM_COUNT = { min: 3, max: 8, default: 4 } as const;
const STAND_LETTERS = 'BCDEFGH';
const STORAGE_KEY = 'lemonade-solo-v1';

export type SoloDifficulty = 'easy' | 'normal' | 'hard';

// 難易度：市場の大きさ（1チームあたりの額の幅）と CPU の強さ。数値は src/solo/balance.test.ts で確かめて決めた
export const SOLO_DIFFICULTY: Record<SoloDifficulty, { label: string; description: string; market: MarketSizeRange; cpuSkill: CpuSkill }> = {
  easy: { label: 'やさしい', description: 'お客さんが多め。ロボット店長は作戦どおりに動くだけ', market: { min: 17000, max: 22000 }, cpuSkill: 'basic' },
  normal: { label: 'ふつう', description: 'お客さんの数はゲームごとにちがう。ロボット店長は先月の結果を見て作戦を変える', market: { min: 12000, max: 17000 }, cpuSkill: 'adaptive' },
  hard: { label: 'むずかしい', description: 'お客さんが少なめ。ロボット店長は先月の結果を見て作戦を変える', market: { min: 10000, max: 14000 }, cpuSkill: 'adaptive' },
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
  // yearEnd：年の決算（2年以上のとき、年の終わりに見せる。conditions はもう次の年の1か月目）
  phase: 'input' | 'result' | 'yearEnd' | 'final';
}

export function newSoloGame(options: {
  seed: string;
  pattern?: MarketPattern; // 市場のパターン（初期値：変動なし）
  difficulty?: SoloDifficulty;
  teamCount?: number; // お店の数（あなたを含む。3〜8）
  elimination?: boolean; // 脱落あり（資金がマイナスになったら脱落。初期値：なし）
  years?: number; // 経営する年数（1〜5。初期値：1）
}): SoloState {
  const difficulty = options.difficulty ?? 'normal';
  const teamCount = Math.min(SOLO_TEAM_COUNT.max, Math.max(SOLO_TEAM_COUNT.min, Math.floor(options.teamCount ?? SOLO_TEAM_COUNT.default)));
  const cpuIds = Array.from({ length: teamCount - 1 }, (_, i) => `t${i + 2}`);
  // お客さんの数（市場の大きさ）はゲームごとにランダム。幅は難易度で決まる。動き方は市場のパターンで決まる
  const config = withMarketPattern(
    withRandomMarketSize(defaultConfig(teamCount, options.seed), teamCount, SOLO_DIFFICULTY[difficulty].market),
    options.pattern ?? 'stable',
  );
  // ソロはタイマーがないので、バリスタの人数を毎月決められる
  config.baristaCadence = 'monthly';
  config.months = MONTHS_PER_YEAR * Math.min(MAX_YEARS, Math.max(1, Math.floor(options.years ?? 1)));
  if (options.elimination) config.elimination = true;

  // 4つの作戦から選び、どの店に割り当てるかもシードで決める（毎回ちがう並び）。
  // 「ふつう」「むずかしい」では安売りを必ず入れる（いないと、何も考えなくても勝ててしまうため）
  // ロボット店長が4店以上のときは、4つの作戦を一通り使ったうえで、残りをシードで選ぶ（同じ作戦が2店になる）
  const withDiscount = difficulty !== 'easy';
  const firstRound = Math.min(cpuIds.length, 3) - (withDiscount ? 1 : 0);
  const pool = withDiscount ? CPU_TYPES.filter((t) => t !== 'discount') : [...CPU_TYPES];
  const ordered = [...pool]
    .map((type, i) => ({ type, key: seededRand(`${options.seed}:cpu-pick`, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.type);
  const picked = ordered.slice(0, firstRound);
  const rest = [...ordered.slice(firstRound)];
  const extra: CpuType[] = [];
  for (let i = 0; extra.length < cpuIds.length - 3; i++) {
    extra.push(rest.length > 0 ? rest.shift()! : CPU_TYPES[Math.floor(seededRand(`${options.seed}:cpu-extra`, i) * CPU_TYPES.length)]!);
  }
  const shuffled = [...picked, ...(withDiscount ? ['discount' as const] : []), ...extra]
    .map((type, i) => ({ type, key: seededRand(`${options.seed}:cpu-assign`, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.type);
  const cpu: Record<string, CpuType> = {};
  cpuIds.forEach((id, i) => { cpu[id] = shuffled[i]!; });

  const names: Record<string, string> = { t1: 'あなたのお店' };
  cpuIds.forEach((id, i) => { names[id] = `🤖 ${STAND_LETTERS[i]}スタンド`; });
  const { teams, conditions } = startTerm(config, Object.entries(names).map(([teamId, name]) => ({ teamId, name })));
  return { version: 1, difficulty, config, names, cpu, teams, conditions, results: [], decided: {}, phase: 'input' };
}

// 人の決定を受け取り、CPU の決定と合わせて1か月を締め切る
export function submitHuman(state: SoloState, decision: MonthlyDecision, baristaCount?: number): SoloState {
  if (state.phase !== 'input' || humanEliminatedMonth(state) !== null) return state;
  const c = state.conditions;
  const human: Submission = {
    teamId: HUMAN_ID,
    monthlyDecision: decision,
    ...(canChangeBarista(c.month, state.config.baristaCadence) && baristaCount !== undefined ? { quarterlyDecision: { baristaCount } } : {}),
    order: 0,
  };
  return { ...closeSoloMonth(state, human), phase: 'result' };
}

// 1か月を締め切る。人が脱落しているときは human = null（ロボット店長だけで進める）
function closeSoloMonth(state: SoloState, human: Submission | null): SoloState {
  const c = state.conditions;
  const seed = state.config.market.seed;
  const active = state.teams.filter(isActive);
  const cpuSubs: Submission[] = active
    .filter((t) => t.teamId !== HUMAN_ID)
    .map((t) => {
      const view = cpuViewOf({
        month: c.month,
        prices: c.prices,
        // 脱落したお店は数えない（残っているお店の数で売れる数を見込む）
        rules: { baristaCapacity: state.config.baristaCapacity, recipe: state.config.recipe, teamCount: active.length },
        me: t,
        results: state.results,
        baristaCadence: state.config.baristaCadence,
      });
      const dice = (k: number) => seededRand(`${seed}:cpu:${t.teamId}`, c.month * 100 + k);
      const skill = SOLO_DIFFICULTY[state.difficulty ?? 'easy'].cpuSkill;
      return { teamId: t.teamId, ...decideCpu(state.cpu[t.teamId]!, view, dice, skill), order: 0 };
    });

  // 提出順（同じ値段のときの端数の順番）は毎月シードで決める。人がいつも先になると有利すぎるため
  const subs = [...(human ? [human] : []), ...cpuSubs]
    .map((s, i) => ({ s, key: seededRand(`${seed}:order`, c.month * 100 + i) }))
    .sort((a, b) => a.key - b.key)
    .map(({ s }, i) => ({ ...s, order: i + 1 }));

  const r = closeMonth(state.config, state.teams, c, subs, state.decided);
  return { ...state, teams: r.teams, decided: { ...state.decided, ...r.decided }, results: [...state.results, r.result] };
}

// 次の月へ。最終月の後なら期末にする。
// 人が脱落していたら、残りの月はロボット店長だけで最後まで進めて期末にする（最終順位を見せるため）
export function nextSoloMonth(state: SoloState): SoloState {
  if (state.phase !== 'result') return state;
  let s = state;
  for (;;) {
    const last = s.results[s.results.length - 1];
    const next = openNextMonth(s.config, s.conditions.month, s.teams.length, last?.prices ?? s.conditions.prices);
    if (!next) return { ...s, phase: 'final' };
    // 人が続けているなら、年の終わりは決算を見せてから次の年へ
    if (humanEliminatedMonth(s) === null) return { ...s, conditions: next, phase: isYearEnd(s.conditions.month) ? 'yearEnd' : 'input' };
    s = { ...s, conditions: next, phase: 'input' };
    s = { ...closeSoloMonth(s, null), phase: 'result' };
  }
}

// 年の決算を見たあと、次の年の1か月目へ
export function startNextYear(state: SoloState): SoloState {
  return state.phase === 'yearEnd' ? { ...state, phase: 'input' } : state;
}

// 人が脱落した月（脱落していなければ null）
export function humanEliminatedMonth(state: SoloState): number | null {
  return state.teams.find((t) => t.teamId === HUMAN_ID)?.eliminatedMonth ?? null;
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

// ロボット店長のお店の記号（t2 → B … t8 → H）
export function standLetter(teamId: string): string | null {
  const i = Number(teamId.slice(1)) - 2;
  return teamId.startsWith('t') && i >= 0 && i < STAND_LETTERS.length ? STAND_LETTERS[i]! : null;
}
