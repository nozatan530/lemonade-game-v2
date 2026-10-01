import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../engine/config';
import { closeMonth, startTerm } from '../engine/month';
import { buildGameLog } from './game-log';

describe('ルームモードのゲームの記録', () => {
  it('順位・人とロボットの数・平均の値段・月ごとの市場の大きさが入る', () => {
    const config = defaultConfig(2, 'log');
    const { teams, conditions } = startTerm(config, [{ teamId: 't01', name: 'A' }, { teamId: 't02', name: 'B' }]);
    const r = closeMonth(config, teams, conditions, [
      { teamId: 't01', monthlyDecision: { lemonQty: 10, sugarQty: 10, price: 200 }, order: 1 },
      { teamId: 't02', monthlyDecision: { lemonQty: 10, sugarQty: 10, price: 300 }, order: 2 },
    ], {});
    const state = Object.fromEntries(r.teams.map((t) => [t.teamId, t]));
    const log = buildGameLog({
      code: 'ABC123', difficulty: 'normal', pattern: 'stable', results: [r.result], state,
      names: { t01: '🐊 Alligator', t02: '🐻 Bear' }, robots: { t02: 'discount' }, recipe: config.recipe, appVersion: 'test',
    });
    expect(log.kind).toBe('gameLog');
    expect(log.humans).toBe(1);
    expect(log.robots).toBe(1);
    expect(log.months).toBe(1);
    expect(log.budgets).toEqual([r.result.marketBudget]);
    expect(log.teams.map((t) => t.rank)).toEqual([1, 2]);
    const bear = log.teams.find((t) => t.name === '🐻 Bear')!;
    expect(bear.kind).toBe('discount');
    expect(bear.avgPrice).toBe(300);
    // 個人の情報（uid など）は入らない
    expect(JSON.stringify(log)).not.toMatch(/uid/);
  });
});
