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

## デプロイ
本番の Firebase プロジェクトを用意してから追記する。
