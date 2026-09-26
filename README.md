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
