// セキュリティルールのテスト（ローカルのエミュレーターで動かす：npm run test:emu）

import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import rules from '../../../database.rules.json?raw';

const CODE = 'ABCDEF';
const G = `games/${CODE}`;
const TS = { '.sv': 'timestamp' };
const decision = { lemonQty: 10, sugarQty: 10, price: 100 };

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-lemonade', database: { rules } });
});
afterAll(async () => { await env.cleanup(); });

// GM（Google ログイン）、チームA・B（匿名）、部外者（匿名）
const gm = () => env.authenticatedContext('gm', { firebase: { sign_in_provider: 'google.com' } }).database();
const anon = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).database();
const teamA = () => anon('uidA');
const teamB = () => anon('uidB');
const nobody = () => env.unauthenticatedContext().database();

async function seed(clock: Partial<Record<string, unknown>> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.database().ref(G).set({
      meta: { gmUid: 'gm', createdAt: 1, status: 'active' },
      config: { months: 12 },
      clock: {
        month: 2, monthKey: 'm02', phase: 'input', deadlineAt: Date.now() + 60000, quarterStart: false,
        prices: { lemon: 80, sugar: 10, barista: 2000 }, ...clock,
      },
      teams: {
        t01: { name: 'A', order: 0, uid: 'uidA' },
        t02: { name: 'B', order: 1, uid: 'uidB' },
        t03: { name: 'C', order: 2 },
      },
      hidden: { m02: { marketBudget: 60000 } },
      decided: { m01: { t01: decision } },
      results: { m01: { month: 1 } },
      subs: { m02: { t02: { monthlyDecision: decision, submittedAt: 1 } } },
    });
  });
}

beforeEach(async () => {
  await env.clearDatabase();
  await seed();
});

describe('ゲームの作成と削除', () => {
  it('Google ログインの GM はゲームを作れる', async () => {
    await assertSucceeds(gm().ref('games/NEW111/meta').set({ gmUid: 'gm', createdAt: 1, status: 'active' }));
  });

  it('匿名のユーザーはゲームを作れない', async () => {
    await assertFails(teamA().ref('games/NEW111/meta').set({ gmUid: 'uidA', createdAt: 1, status: 'active' }));
  });

  it('他人のゲームの meta は上書きできない', async () => {
    const other = env.authenticatedContext('gm2', { firebase: { sign_in_provider: 'google.com' } }).database();
    await assertFails(other.ref(`${G}/meta`).set({ gmUid: 'gm2', createdAt: 1, status: 'active' }));
  });

  it('GM は自分のゲームを削除できる。チームはできない', async () => {
    await assertFails(teamA().ref(G).remove());
    await assertSucceeds(gm().ref(G).remove());
  });
});

describe('読み取り', () => {
  it('ゲーム全体をまとめて読むことはできない（締切前の他チームの提出が見えないように）', async () => {
    await assertFails(teamA().ref(G).once('value'));
  });

  it('チームは進行・チーム・結果を読める', async () => {
    await assertSucceeds(teamA().ref(`${G}/clock`).once('value'));
    await assertSucceeds(teamA().ref(`${G}/teams`).once('value'));
    await assertSucceeds(teamA().ref(`${G}/results`).once('value'));
  });

  it('チームは市場予算と、補った決定を読めない', async () => {
    await assertFails(teamA().ref(`${G}/hidden`).once('value'));
    await assertFails(teamA().ref(`${G}/decided`).once('value'));
  });

  it('チームは自分の提出だけ読める。他チームの提出は読めない', async () => {
    await assertSucceeds(teamB().ref(`${G}/subs/m02/t02`).once('value'));
    await assertFails(teamA().ref(`${G}/subs/m02/t02`).once('value'));
    await assertFails(teamA().ref(`${G}/subs/m02`).once('value'));
  });

  it('GM はすべての提出を読める', async () => {
    await assertSucceeds(gm().ref(`${G}/subs/m02`).once('value'));
  });

  it('ログインしていない人は何も読めない', async () => {
    await assertFails(nobody().ref(`${G}/clock`).once('value'));
  });
});

describe('チームの参加', () => {
  it('空いている枠に参加できる', async () => {
    await assertSucceeds(anon('uidC').ref(`${G}/teams/t03/uid`).set('uidC'));
  });

  it('ほかの端末が使っている枠は取れない', async () => {
    await assertFails(anon('uidC').ref(`${G}/teams/t01/uid`).set('uidC'));
  });

  it('存在しない枠は作れない', async () => {
    await assertFails(anon('uidC').ref(`${G}/teams/t09/uid`).set('uidC'));
  });

  it('チーム名は変えられない', async () => {
    await assertFails(teamA().ref(`${G}/teams/t01/name`).set('X'));
  });

  it('GM は枠を解除できる', async () => {
    await assertSucceeds(gm().ref(`${G}/teams/t01/uid`).remove());
  });
});

describe('提出', () => {
  const sub = (extra: Record<string, unknown> = {}) => ({ monthlyDecision: decision, submittedAt: TS, ...extra });

  it('入力中なら、自分のチームの今月の分を提出できる（出し直しもできる）', async () => {
    await assertSucceeds(teamA().ref(`${G}/subs/m02/t01`).set(sub()));
    await assertSucceeds(teamA().ref(`${G}/subs/m02/t01`).set(sub()));
    await assertSucceeds(teamA().ref(`${G}/submitted/m02/t01`).set(true));
  });

  it('他チームの分は提出できない', async () => {
    await assertFails(teamA().ref(`${G}/subs/m02/t02`).set(sub()));
    await assertFails(teamA().ref(`${G}/submitted/m02/t02`).set(true));
  });

  it('提出時刻はサーバーの時刻でなければならない（端数を独り占めできないように）', async () => {
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set({ monthlyDecision: decision, submittedAt: 0 }));
  });

  it('今月以外の月には提出できない', async () => {
    await assertFails(teamA().ref(`${G}/subs/m03/t01`).set(sub()));
  });

  it('締切を過ぎたら提出できない', async () => {
    await env.clearDatabase();
    await seed({ deadlineAt: Date.now() - 10000 });
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set(sub()));
  });

  it('結果の表示中は提出できない', async () => {
    await env.clearDatabase();
    await seed({ phase: 'result' });
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set(sub()));
  });

  it('負の数や、決まっていない項目は受け付けない', async () => {
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set(sub({ monthlyDecision: { ...decision, price: -1 } })));
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set(sub({ monthlyDecision: { ...decision, cheat: 1 } })));
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set(sub({ bonus: 1 })));
  });

  it('販売上限と静観は任意で付けられる', async () => {
    await assertSucceeds(teamA().ref(`${G}/subs/m02/t01`).set(sub({ monthlyDecision: { ...decision, maxSell: 5 } })));
    await assertSucceeds(teamA().ref(`${G}/subs/m02/t01`).set(sub({
      monthlyDecision: { lemonQty: 0, sugarQty: 0, price: 0, watching: true },
    })));
  });

  it('バリスタ人数は四半期の最初の月だけ送れる', async () => {
    await assertFails(teamA().ref(`${G}/subs/m02/t01`).set(sub({ quarterlyDecision: { baristaCount: 2 } })));
    await env.clearDatabase();
    await seed({ month: 4, monthKey: 'm04', quarterStart: true });
    await assertSucceeds(teamA().ref(`${G}/subs/m04/t01`).set(sub({ quarterlyDecision: { baristaCount: 2 } })));
  });
});

describe('GM だけが書けるもの', () => {
  it('チームは進行・状態・結果・市場予算を書けない', async () => {
    await assertFails(teamA().ref(`${G}/clock/phase`).set('result'));
    await assertFails(teamA().ref(`${G}/state/t01/balance`).set(999999));
    await assertFails(teamA().ref(`${G}/results/m02`).set({ month: 2 }));
    await assertFails(teamA().ref(`${G}/hidden/m02`).set({ marketBudget: 1 }));
  });

  it('GM は結果を書けるが、一度書いた月の結果は上書きできない', async () => {
    await assertSucceeds(gm().ref(`${G}/results/m02`).set({ month: 2 }));
    await assertFails(gm().ref(`${G}/results/m01`).set({ month: 1 }));
  });

  it('GM は結果・状態・進行をまとめて書ける', async () => {
    await assertSucceeds(gm().ref(G).update({
      'results/m02': { month: 2 },
      state: { t01: { balance: 1 } },
      'decided/m02': { t01: decision },
      'clock/phase': 'result',
    }));
  });
});
