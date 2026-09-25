// 旧版（legacy/index.html）と新しい engine を同じ入力で動かし、結果が一致することを確かめる。
// 比べるもの：市場予算と単価の推移、各チームの販売数・売上・費用・利益・在庫・資金。
// GM の手入力による上書き（予算・単価）は engine の外の話なので、両方に同じ値を渡して比べる。
// 乱数は旧版に欠陥があったので v2 では作り直した（docs/decisions.md）。
// 市場予算と原価の計算式が同じことは、engine に旧版の乱数（legacySeededRand）を渡して比べる。

import { describe, expect, it } from 'vitest';
import { autoMonthValues, monthConditions, scenarioMonthValues } from '../demand';
import { defaultConfig, isQuarterStart } from '../config';
import { initialTeamState, resolveMonth } from '../month';
import { legacySeededRand } from '../random';
import type { CostMode, GameConfig, ScenarioId, Submission, TeamState, UnitPrices } from '../types';
import { createLegacy, type LegacyG } from './legacy/load-legacy';

const legacy = createLegacy();

// v2 のお知らせ文は暦の月の表記（「1月。」など）を消している。月の表示は画面側で開始月から組み立てる
const withoutMonthLabel = (msg: string) => msg.replace(/ \d+月。/, ' ');

// テスト入力を作るための乱数（engine の乱数とは別）
function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeConfig(teamCount: number, seed: string, costMode: CostMode, scenario: ScenarioId): GameConfig {
  const c = defaultConfig(teamCount, seed);
  c.market.costMode = costMode;
  c.scenario = scenario;
  return c;
}

function legacyG(config: GameConfig, teamNames: string[]): LegacyG {
  const IC = config.initialPrices;
  return {
    month: 1,
    maxMonths: config.months,
    config: {
      costLemon: IC.lemon, costSugar: IC.sugar, costBarista: IC.barista,
      baristaCapacity: config.baristaCapacity,
      recipeLemon: config.recipe.lemon, recipeSugar: config.recipe.sugar,
      startFund: config.startFund,
    },
    initialConfig: { costLemon: IC.lemon, costSugar: IC.sugar, costBarista: IC.barista },
    market: { ...config.market },
    scenario: config.scenario,
    teams: teamNames.map((name) => ({ name, balance: config.startFund, totalProfit: 0, stockLemon: 0, stockSugar: 0 })),
    submissions: {},
    history: [],
    lastResult: null,
    forecast: null,
  };
}

const COST_MODES: CostMode[] = ['fixed', 'random', 'trend', 'shock'];
const SCENARIO_IDS: ScenarioId[] = ['none', 'summer', 'inflation', 'chaos'];
const SEEDS = ['x', 'lemon2025', '1727236800000', 'abc', 'テスト'];

describe('旧版との比較：市場予算と単価', () => {
  it('autoMonthValues は旧版の calcNextMonthValues と同じ', () => {
    for (const seed of SEEDS) for (const costMode of COST_MODES) for (let month = 1; month <= 12; month++) {
      const config = makeConfig(4, seed, costMode, 'none');
      config.market.costRange = 35;
      const G = legacyG(config, ['A', 'B', 'C', 'D']);
      const old = legacy.calcNextMonthValues(month, G);
      const now = autoMonthValues(month, config, legacySeededRand);
      expect(now).toEqual({
        marketBudget: old.marketBudget,
        prices: { lemon: old.costLemon, sugar: old.costSugar, barista: old.costBarista },
      });
    }
  });

  it('scenarioMonthValues は旧版の getScenarioMonth と同じ', () => {
    for (const scenario of SCENARIO_IDS) for (const n of [2, 3, 5, 8]) for (let month = 1; month <= 12; month++) {
      const config = makeConfig(n, 's', 'fixed', scenario);
      const G = legacyG(config, Array.from({ length: n }, (_, i) => `T${i}`));
      const old = legacy.getScenarioMonth(month, G);
      const now = scenarioMonthValues(month, config, n);
      if (old === null) {
        expect(now).toBeNull();
      } else {
        expect(now).toEqual({
          marketBudget: old.marketBudget,
          prices: { lemon: old.costLemon, sugar: old.costSugar, barista: old.costBarista },
          message: withoutMonthLabel(old.msg),
        });
      }
    }
  });

  it('12か月の進行（旧版の startGame → nextMonth）と monthConditions が同じ', () => {
    for (const seed of SEEDS) for (const costMode of COST_MODES) for (const scenario of SCENARIO_IDS) {
      const n = 3;
      const config = makeConfig(n, seed, costMode, scenario);
      const G = legacyG(config, ['A', 'B', 'C']);
      legacy.setG(G);

      // 1か月目（旧版の startGame）
      let prev: UnitPrices = { ...config.initialPrices };
      let cond = monthConditions(1, config, n, prev, legacySeededRand);
      expect(cond.marketBudget).toBe(legacy.calcNextMonthValues(1, G).marketBudget);
      expect(cond.prices).toEqual({ lemon: G.config.costLemon, sugar: G.config.costSugar, barista: G.config.costBarista });

      for (let month = 2; month <= 12; month++) {
        prev = cond.prices;
        legacy.nextMonth();
        cond = monthConditions(month, config, n, prev, legacySeededRand);
        expect(G.month).toBe(month);
        expect(cond.marketBudget).toBe(legacy.getBudget());
        expect(cond.prices).toEqual({ lemon: G.config.costLemon, sugar: G.config.costSugar, barista: G.config.costBarista });
        expect(cond.message).toBe(G.eventMsg ? withoutMonthLabel(G.eventMsg.text) : undefined);
      }
    }
  });
});

describe('旧版との比較：12か月の販売と損益', () => {
  // ランダムな決定で12か月を回し、毎月すべてのチームの結果を旧版と比べる
  function playBoth(gameSeed: number) {
    const rand = mulberry32(gameSeed);
    const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

    const n = int(2, 8);
    const names = Array.from({ length: n }, (_, i) => `T${i + 1}`);
    const config = makeConfig(n, `g${gameSeed}`, pick(COST_MODES), pick(SCENARIO_IDS));
    config.recipe = pick([{ lemon: 1, sugar: 1 }, { lemon: 2, sugar: 1 }, { lemon: 1, sugar: 3 }]);
    config.baristaCapacity = pick([30, 50]);

    const G = legacyG(config, names);
    legacy.setG(G);
    let teams: TeamState[] = names.map((name) => initialTeamState(name, name, config));
    let prices: UnitPrices = { ...config.initialPrices };

    for (let month = 1; month <= 12; month++) {
      const cond = monthConditions(month, config, n, prices, legacySeededRand);
      prices = cond.prices;
      // 予算は、ときどき GM が手で小さく上書きした想定にする（途中で予算が尽きるケース）
      const budget = rand() < 0.3 ? int(0, 8000) : cond.marketBudget;
      cond.marketBudget = budget;

      // 旧版にも同じ条件を与える
      G.month = month;
      G.config.costLemon = cond.prices.lemon;
      G.config.costSugar = cond.prices.sugar;
      G.config.costBarista = cond.prices.barista;
      legacy.setBudget(budget);

      // 提出順をランダムに
      const orders = names.map((_, i) => i + 1).sort(() => rand() - 0.5);
      const submissions: Submission[] = [];
      G.submissions = {};

      teams.forEach((t, i) => {
        const barista = isQuarterStart(month) ? int(0, 3) : t.baristaCount;
        const watching = rand() < 0.1;
        const lemonQty = watching ? 0 : int(0, 150);
        const sugarQty = watching ? 0 : int(0, 150);
        const price = watching ? 0 : pick([0, 100, 150, 150, 200, 200, 250, 300]);
        const maxSell = watching ? 0 : rand() < 0.5 ? undefined : int(0, 160);
        const order = orders[i]!;

        submissions.push({
          teamId: t.teamId,
          monthlyDecision: {
            lemonQty, sugarQty, price,
            ...(maxSell !== undefined ? { maxSell } : {}),
            ...(watching ? { watching } : {}),
          },
          ...(isQuarterStart(month) ? { quarterlyDecision: { baristaCount: barista } } : {}),
          order,
        });

        // 旧版の販売チーム画面（generateSubmitCode）と同じ手順で提出データを作る。
        // 旧版はバリスタを毎月入力するので、四半期で決めた人数を毎月入れる。
        // 静観は「仕入れ0・販売0・バリスタはそのまま」として送る（v2 の静観と同じ費用になる）
        legacy.setSC({ stockLemon: t.stock.lemon, stockSugar: t.stock.sugar });
        const { maxMake } = legacy.calcMake(lemonQty, sugarQty, barista, G.config);
        const effSell = Math.min(maxSell ?? maxMake, maxMake);
        const sellable = price > 0 ? effSell : 0; // 旧版の画面は価格0での販売を受け付けない
        G.submissions[t.name] = {
          team: t.name, month,
          lemonQty, sugarQty, baristaCount: barista,
          price: sellable > 0 ? price : 0,
          maxSell: sellable,
          isWatching: sellable === 0,
          submitOrder: order,
        };
      });

      const r = resolveMonth(config, teams, cond, submissions);
      teams = r.teams;
      legacy.runAuction();

      const old = G.lastResult;
      expect(old.month).toBe(month);
      expect(old.marketBudget).toBe(budget);
      r.result.teamResults.forEach((now, i) => {
        const o = old.teamResults[i];
        const ctx = `game=${gameSeed} month=${month} team=${o.name}`;
        expect({
          price: now.price, offered: now.offered, sold: now.sold, revenue: now.revenue,
          costLemon: now.costLemon, costSugar: now.costSugar, costBarista: now.costBarista,
          totalCost: now.totalCost, profit: now.profit,
          usedLemon: now.usedLemon, usedSugar: now.usedSugar,
          stockLemon: now.stock.lemon, stockSugar: now.stock.sugar, balance: now.balance,
        }, ctx).toEqual({
          price: o.price, offered: o.maxSell, sold: o.sold, revenue: o.revenue,
          costLemon: o.costLemon, costSugar: o.costSugar, costBarista: o.costBarista,
          totalCost: o.cost, profit: o.profit,
          usedLemon: o.usedLemon, usedSugar: o.usedSugar,
          stockLemon: o.stockLemon, stockSugar: o.stockSugar, balance: o.balance,
        });
        expect(teams[i]!.totalProfit, ctx).toBe(G.teams[i].totalProfit);
      });
    }
  }

  it('ランダムな300ゲーム（各12か月）で、すべてのチーム・すべての月が一致する', () => {
    for (let s = 1; s <= 300; s++) playBoth(s);
  });
});
