// 「はじめに」：ゲームの目的・毎月の流れ・お客さんのルール・ことば・ヒント。トップ画面からいつでも読める。

import { resetInputCoach } from '../team/input-coach';

export function renderGuide(root: HTMLElement): () => void {
  root.innerHTML = `<div class="page guide">
    <h1>🍋 はじめに</h1>

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

    <a class="btn" href="#/solo">ソロモードで遊ぶ</a>
    <button class="btn secondary" type="button" id="coachAgain">最初の案内をもう一度見る</button>
    <p class="center"><a href="#/">トップにもどる</a></p>
  </div>`;
  root.querySelector('#coachAgain')!.addEventListener('click', () => {
    resetInputCoach();
    alert('次に1か月目の入力画面を開いたときに、案内が出ます。');
  });
  return () => {};
}
