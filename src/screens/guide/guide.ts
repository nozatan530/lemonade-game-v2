// 「はじめに」：ゲームの目的・毎月の流れ・お客さんのルール・ことば・ヒント。トップ画面からいつでも読める。

import { lang, t } from '../../i18n';
import { bindLangToggle, langToggleHtml } from '../../ui/lang-toggle';
import { resetInputCoach } from '../team/input-coach';

// 本文は長いので、日本語と英語をそれぞれまるごと持つ
const JA = `    <h1>🍋 はじめに</h1>

    <div class="card">
      <h2>このゲームでやること</h2>
      <p>あなたはレモネード屋さんの店長です。<strong>1年（12か月）</strong>のあいだ、毎月レモネードを作って売ります。</p>
      <p>ほかの3つのお店は、<strong>🤖 ロボット店長</strong>がルールにしたがって決めています（ソロモード）。先月の結果を見て、作戦を変えるロボットもいます。</p>
      <p style="margin-bottom:0">はじめのお金は <strong>10,000円</strong>。1年たったときに、<strong>いちばんお金を増やしたお店の勝ち</strong>です。</p>
    </div>

    <div class="card">
      <h2>毎月やること</h2>
      <p class="muted" style="margin-top:0">入力画面はこんな形です。番号の順に決めていきます。</p>
      <div class="guide-mock">
        <div class="mock-block"><span class="mock-no">1</span><strong>仕入れる</strong>
          <div class="mock-row">🍋 レモン <span>¥80 × 50個 ＝ ¥4,000</span></div>
          <div class="mock-row">🍬 砂糖 <span>¥10 × 50袋 ＝ ¥500</span></div>
          <div class="mock-row">👩‍🍳 バリスタ <span>¥2,000 × 1人 ＝ ¥2,000</span></div>
        </div>
        <div class="mock-block"><span class="mock-no">2</span><strong>値段を決める</strong>
          <div class="mock-row">💰 1杯の値段 <span>300円 × 50杯</span></div>
          <div class="mock-row muted">1杯あたりの原価 ¥130 ／ 元がとれる数 22杯</div>
        </div>
        <div class="mock-block mock-cash"><span class="mock-no">3</span><strong>月末のお金を確かめて、すすめる</strong>
          <div class="mock-row">月末の資金 <span>¥3,500 〜 ¥18,500</span></div>
        </div>
      </div>
      <ol class="guide-steps">
        <li><strong>仕入れる</strong>：レモンと砂糖を何個買うか、バリスタ（レモネードを作る人）を何人にするかを決めます。1杯＝レモン1個＋砂糖1袋。バリスタ1人で1か月に50杯まで作れます。</li>
        <li><strong>値段を決める</strong>：1杯いくらで売るかを決めます。</li>
        <li><strong>月末のお金を確かめる</strong>：画面の下に、月末にお金がいくらになりそうかが出ます。売れた数しだいで「1杯も売れなかったら〜全部売れたら」の間になります。決めたら「すすめる」を押します。</li>
      </ol>
      <p style="margin-bottom:0">すすめると、その月の<strong>結果</strong>が出ます。売上から費用を引いた「もうけ」と、ほかのお店の値段や売れた数も見られます。</p>
    </div>

    <div class="card">
      <h2>お客さんのルール</h2>
      <ul>
        <li>お客さんは<strong>安いお店から順に</strong>買います。</li>
        <li>お客さんが使えるお金には<strong>限り</strong>があります（市場の大きさ）。高すぎると、お金が先に安いお店で使われて、売れ残ります。</li>
        <li>作って売れ残ったレモネードは<strong>捨てます</strong>（材料のお金がむだになります）。</li>
        <li>お店に出さなかった材料は、<strong>来月に残せます</strong>。</li>
        <li>お客さんの数は月によってちがいます。先月の結果にある「お客さんが使えたお金」が手がかりです。</li>
      </ul>
    </div>

    <div class="card">
      <h2>ことば</h2>
      <dl class="guide-terms">
        <dt>売上</dt><dd>売れたレモネードのお金。売れた数 × 値段。</dd>
        <dt>原価（材料費）</dt><dd>レモンと砂糖を買ったお金。</dd>
        <dt>人件費</dt><dd>バリスタの給料。売れても売れなくても、雇っている人数分が毎月かかります。</dd>
        <dt>もうけ（利益）</dt><dd>売上 − 材料費 − 人件費。マイナスなら損。</dd>
        <dt>1杯あたりの原価</dt><dd>1杯を作るのにかかるお金（材料費＋給料を作った数で分けたもの）。値段がこれより安いと、売るほど損します。</dd>
        <dt>元がとれる数</dt><dd>その月に使ったお金を、売上で取りもどすのに売る必要がある数。</dd>
        <dt>市場の大きさ</dt><dd>その月にお客さん全員が使えるお金の合計。</dd>
      </dl>
    </div>

    <div class="card">
      <h2>勝つためのヒント</h2>
      <ul>
        <li>結果の「みんなの結果」で、ライバルの値段と売れた数を見てみよう。</li>
        <li>売り切れたら、もっと作れた（お客さんが残っていた）のかもしれません。売れ残ったら、値段が高すぎたか、作りすぎたのかも。</li>
        <li>夏はお客さんが多く、冬は少ない市場もあります。お知らせをよく読んで、バリスタの人数を考えよう。</li>
        <li>月末のお金がマイナスにならないように気をつけよう。</li>
      </ul>
    </div>

`;

const EN = `    <h1>🍋 How to play</h1>

    <div class="card">
      <h2>What you do in this game</h2>
      <p>You are the manager of a lemonade stand. For <strong>one year (12 months)</strong>, you make and sell lemonade every month.</p>
      <p>The other 3 stands are run by <strong>🤖 robot managers</strong> that follow rules (solo mode). Some robots change their strategy after looking at last month's results.</p>
      <p style="margin-bottom:0">You start with <strong>¥10,000</strong>. After one year, <strong>the stand that has grown its money the most wins</strong>.</p>
    </div>

    <div class="card">
      <h2>What you do each month</h2>
      <p class="muted" style="margin-top:0">The input screen looks like this. Decide things in number order.</p>
      <div class="guide-mock">
        <div class="mock-block"><span class="mock-no">1</span><strong>Buy supplies</strong>
          <div class="mock-row">🍋 Lemons <span>¥80 × 50 ＝ ¥4,000</span></div>
          <div class="mock-row">🍬 Sugar <span>¥10 × 50 ＝ ¥500</span></div>
          <div class="mock-row">👩‍🍳 Baristas <span>¥2,000 × 1 ＝ ¥2,000</span></div>
        </div>
        <div class="mock-block"><span class="mock-no">2</span><strong>Set your price</strong>
          <div class="mock-row">💰 Price per cup <span>¥300 × 50 cups</span></div>
          <div class="mock-row muted">Cost per cup ¥130 / Break-even 22 cups</div>
        </div>
        <div class="mock-block mock-cash"><span class="mock-no">3</span><strong>Check your money, then go</strong>
          <div class="mock-row">Money at month end <span>¥3,500 〜 ¥18,500</span></div>
        </div>
      </div>
      <ol class="guide-steps">
        <li><strong>Buy supplies</strong>: decide how many lemons and bags of sugar to buy, and how many baristas (the people who make lemonade) to hire. 1 cup = 1 lemon + 1 bag of sugar. One barista can make up to 50 cups a month.</li>
        <li><strong>Set your price</strong>: decide how much one cup costs.</li>
        <li><strong>Check your money</strong>: the bottom of the screen shows how much money you will have at the end of the month. It will be somewhere between "nothing sold" and "sold out". When you're ready, tap the button to go on.</li>
      </ol>
      <p style="margin-bottom:0">Then you see the month's <strong>results</strong>: your profit (sales minus costs), plus the other stands' prices and how much they sold.</p>
    </div>

    <div class="card">
      <h2>How customers buy</h2>
      <ul>
        <li>Customers buy from the <strong>cheapest stand first</strong>.</li>
        <li>Customers only have a <strong>limited</strong> amount of money (the market size). If your price is too high, the money gets spent at cheaper stands first and you have lemonade left over.</li>
        <li>Lemonade you made but didn't sell is <strong>thrown away</strong> (the money for the ingredients is wasted).</li>
        <li>Ingredients you didn't use <strong>carry over to next month</strong>.</li>
        <li>The number of customers changes by month. "Money customers could spend" in last month's results is a good clue.</li>
      </ul>
    </div>

    <div class="card">
      <h2>Words to know</h2>
      <dl class="guide-terms">
        <dt>Sales</dt><dd>Money from the lemonade you sold. Cups sold × price.</dd>
        <dt>Ingredient cost</dt><dd>Money you spent on lemons and sugar.</dd>
        <dt>Staff cost</dt><dd>Barista wages. You pay them every month for everyone you hired, whether you sell or not.</dd>
        <dt>Profit</dt><dd>Sales − ingredient cost − staff cost. If it's negative, you lost money.</dd>
        <dt>Cost per cup</dt><dd>What it costs to make one cup (ingredients + wages divided by the number of cups made). If your price is lower than this, you lose money on every cup.</dd>
        <dt>Break-even cups</dt><dd>How many cups you need to sell to get back the money you spent that month.</dd>
        <dt>Market size</dt><dd>The total money all customers can spend that month.</dd>
      </dl>
    </div>

    <div class="card">
      <h2>Tips for winning</h2>
      <ul>
        <li>Check "Everyone's results" to see your rivals' prices and how much they sold.</li>
        <li>If you sold out, maybe you could have made more (customers still had money). If you had lemonade left, maybe your price was too high, or you made too much.</li>
        <li>In some markets there are more customers in summer and fewer in winter. Read the monthly news and think about how many baristas you need.</li>
        <li>Be careful not to let your money go below zero.</li>
      </ul>
    </div>
`;

export function renderGuide(root: HTMLElement): () => void {
  root.innerHTML = `<div class="page guide">
    <div class="lang-bar">${langToggleHtml()}</div>
${lang() === 'en' ? EN : JA}
    <a class="btn" href="#/solo">${lang() === 'en' ? 'Play solo' : 'ソロモードで遊ぶ'}</a>
    <button class="btn secondary" type="button" id="coachAgain">${lang() === 'en' ? 'Show the first-time guide again' : '最初の案内をもう一度見る'}</button>
    <p class="center"><a href="#/">${t('common.backTop')}</a></p>
  </div>`;
  bindLangToggle(root);
  root.querySelector('#coachAgain')!.addEventListener('click', () => {
    resetInputCoach();
    alert(lang() === 'en' ? 'The guide will appear the next time you open the Month 1 input screen.' : '次に1か月目の入力画面を開いたときに、案内が出ます。');
  });
  return () => {};
}
