// ロボット店長（CPU チーム）を、ソロとルームモードで同じように使うための関数。純粋関数。
// ロボットの考え方そのものは cpu-teams.ts。ここは「どの店にどの作戦を割り当てるか」と
// 「その月のロボットの決定・提出順をそろえる」ところだけを持つ。

import { CPU_TYPES, cpuViewOf, decideCpu } from './cpu-teams';
import { isActive } from './month';
import { seededRand } from './random';
import type { CpuSkill, CpuType, GameConfig, MonthConditions, MonthResult, Submission, TeamState } from './types';

// 作戦の割り当て。4つの作戦から選び、どの店に割り当てるかもシードで決める（毎回ちがう並び）。
// withDiscount なら安売りを必ず入れる（いないと、何も考えなくても勝ててしまうため）。
// ロボットが4店以上のときは、4つの作戦を一通り使ったうえで、残りをシードで選ぶ（同じ作戦が2店になる）
export function assignCpuTypes(seed: string, ids: string[], withDiscount: boolean): Record<string, CpuType> {
  const firstRound = Math.max(0, Math.min(ids.length, 3) - (withDiscount ? 1 : 0));
  const pool = withDiscount ? CPU_TYPES.filter((t) => t !== 'discount') : [...CPU_TYPES];
  const ordered = [...pool]
    .map((type, i) => ({ type, key: seededRand(`${seed}:cpu-pick`, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.type);
  const picked = ordered.slice(0, firstRound);
  const rest = [...ordered.slice(firstRound)];
  const extra: CpuType[] = [];
  for (let i = 0; extra.length < ids.length - 3; i++) {
    extra.push(rest.length > 0 ? rest.shift()! : CPU_TYPES[Math.floor(seededRand(`${seed}:cpu-extra`, i) * CPU_TYPES.length)]!);
  }
  const all = [...picked, ...(withDiscount && ids.length > 0 ? ['discount' as const] : []), ...extra].slice(0, ids.length);
  const shuffled = all
    .map((type, i) => ({ type, key: seededRand(`${seed}:cpu-assign`, i) }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.type);
  const cpu: Record<string, CpuType> = {};
  ids.forEach((id, i) => { cpu[id] = shuffled[i]!; });
  return cpu;
}

// その月のロボットの提出（脱落していないロボットだけ）
export function robotSubmissions(input: {
  config: GameConfig;
  teams: TeamState[];
  conditions: MonthConditions;
  results: MonthResult[];
  cpu: Record<string, CpuType>;
  skill: CpuSkill;
}): Submission[] {
  const { config, conditions: c } = input;
  const seed = config.market.seed;
  const active = input.teams.filter(isActive);
  return active
    .filter((t) => input.cpu[t.teamId] !== undefined)
    .map((t) => {
      const view = cpuViewOf({
        month: c.month,
        prices: c.prices,
        // 脱落したお店は数えない（残っているお店の数で売れる数を見込む）
        rules: { baristaCapacity: config.baristaCapacity, recipe: config.recipe, teamCount: active.length },
        me: t,
        results: input.results,
        baristaCadence: config.baristaCadence,
      });
      const dice = (k: number) => seededRand(`${seed}:cpu:${t.teamId}`, c.month * 100 + k);
      return { teamId: t.teamId, ...decideCpu(input.cpu[t.teamId]!, view, dice, input.skill), order: 0 };
    });
}

// 提出順（同じ値段のときの端数の順番）は毎月シードで決める。いつも同じお店が先になると有利すぎるため
export function shuffleOrder(subs: Submission[], seed: string, month: number): Submission[] {
  return subs
    .map((s, i) => ({ s, key: seededRand(`${seed}:order`, month * 100 + i) }))
    .sort((a, b) => a.key - b.key)
    .map(({ s }, i) => ({ ...s, order: i + 1 }));
}
