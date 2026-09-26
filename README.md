# 🍋 レモネードスタンド経営シミュレーション（v2）

教育用の経営シミュレーションゲーム。詳しくは [CLAUDE.md](CLAUDE.md) と [docs/game-design.md](docs/game-design.md)。

## 開発の準備
- Node.js 24 以上
- Java 21 以上（Firebase のローカルエミュレーターに必要。`brew install openjdk@21` のあと PATH を通す）

```
npm install
```

## 開発中の起動（ローカルのエミュレーターを使う）
ターミナルを2つ開いて、それぞれで実行する。

```
npm run emu      # Firebase のエミュレーター（管理画面: http://localhost:4000）
npm run dev      # 開発サーバー（http://localhost:5173）
```

- `http://localhost:5173/#/dev` … 開発用ページ。ゲームの作成・締切・次の月をボタンで操作できる
- 同じ Wi-Fi のスマホからは、開発サーバーが表示する Network の URL で開ける（エミュレーターにも開発機の IP でつながる）

## テスト
```
npm test         # engine などのテスト
npm run test:emu # セキュリティルールと sync のテスト（エミュレーターを自動で起動・停止する）
```

## デプロイ（Firebase Hosting）
本番の Firebase プロジェクトは `lemonade-game-v2`（Spark プラン）。`.firebaserc` の `prod` がこのプロジェクト。

初回だけ、Firebase CLI にログインする：
```
npx firebase login
```

公開（テスト → ビルド → Hosting とセキュリティルールを反映）：
```
npm run deploy
```

公開先：https://lemonade-game-v2.web.app
- ソロモード：`#/solo`
- 対戦（GM：`#/gm` ／ チーム：`#/team` ／ 全体表示：`#/screen?code=XXXXXX`）は、本番ではまだ「開発中」の表示になる。`npm run dev` では使える。対戦を公開するときは `.env.production` に `VITE_ENABLE_MULTIPLAYER=true` を書く。

GitHub Pages で公開する場合は、`dist/` をそのまま置けばよい（相対パスでビルドしている）。そのときは Firebase コンソールの Authentication →「設定」→「承認済みドメイン」に GitHub Pages のドメインを追加する（Google ログインのため）。

## アンケート（GAS → Google スプレッドシート）
回答は GAS のウェブアプリ（`gas/survey/`）が受け取り、スプレッドシートの「回答」シートに1行ずつ追加する。

準備（1回だけ）：
1. Google スプレッドシートを新しく作る（名前は例：「レモネード アンケート」）。
2. 「拡張機能 → Apps Script」を開き、`gas/survey/Code.gs` の中身を貼り付けて保存する。
3. 「デプロイ → 新しいデプロイ」で種類に「ウェブアプリ」を選ぶ。
   - 次のユーザーとして実行：**自分**
   - アクセスできるユーザー：**全員**
4. 表示された「ウェブアプリの URL」（`https://script.google.com/macros/s/…/exec`）を控える。
5. `.env.production` に `VITE_SURVEY_ENDPOINT=<その URL>` を書いて `npm run deploy`。

- URL が設定されていないと、アンケートの画面は「準備中」と表示される。開発中（`npm run dev`）は `mock` になっていて、どこにも送らずコンソールに出すだけ。
- GAS は、数値や選択肢が決まった範囲か、自由記述が1000文字以内かを確かめてから保存する。`= + - @` で始まる文は式として動かないように `'` を付ける。1分あたり60件を超えたら受け付けない。
- `Code.gs` を直したときは、「デプロイを管理」から同じデプロイを新しいバージョンに更新する（URL を変えないため）。
