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

### 自動で公開（GitHub Actions）
`main` に入ると（PR のマージをふくむ）、CI のテストが通ったあとで、自動で Hosting とセキュリティルールに公開する（`.github/workflows/ci.yml` の `deploy`）。準備は1回だけ：

1. Firebase コンソール →「プロジェクトの設定」→「サービス アカウント」→「新しい秘密鍵を生成」で JSON ファイルをダウンロードする。
   - このサービスアカウントには「Firebase 管理者」の役割がついている。鍵はパスワードと同じなので、リポジトリには入れない。使い終わった JSON ファイルはパソコンから消す。
2. GitHub のリポジトリ →「Settings」→「Secrets and variables」→「Actions」→「Secrets」に、名前 `FIREBASE_SERVICE_ACCOUNT` で JSON の中身をそのまま貼る。
3. `.env.production` に書いている値は、同じ画面の「Variables」に同じ名前で登録する（`VITE_SURVEY_ENDPOINT`、対戦を公開するときは `VITE_ENABLE_MULTIPLAYER`）。CI では `.env.production` を使わないため。

- 鍵が登録されていないあいだは、公開の手順を飛ばして警告だけ出す（テストはふだんどおり）。
- 公開の結果は、GitHub の「Actions」タブで見られる。手元からの `npm run deploy` もこれまでどおり使える。

### GitHub Pages でも公開する
`main` に入ってテストが通ると、Firebase Hosting と同じものを GitHub Pages にも公開する（`.github/workflows/ci.yml` の `pages`）。準備は1回だけ：

1. GitHub のリポジトリ →「Settings」→「Pages」→「Build and deployment」の「Source」を **GitHub Actions** にする。
2. 「Settings」→「Secrets and variables」→「Actions」→「Variables」に、名前 `ENABLE_GITHUB_PAGES`、値 `true` を登録する（登録しないあいだは GitHub Pages には公開しない）。
3. Firebase コンソールの Authentication →「設定」→「承認済みドメイン」に `nozatan530.github.io` を追加する（GitHub Pages から GM が Google でログインするため）。

公開先：`https://nozatan530.github.io/lemonade-game-v2/`（ビルドは相対パスなので、どちらでも同じように動く）

### ルームモード
`#/room` はだれでも使える（ログイン不要）。GM の登録はいらない。古いルームは、新しいルームが作られるときに自動で消える（作成から6時間）。

### GM になれる人を決める（限定公開）
GM モード（ゲームを作って進行する）は、許可したアカウントだけが使える。ソロモードとチームの参加は、だれでも使える。

1. 公開中のサイトの `#/gm` を開き、GM にしたい Google アカウントでログインする。
2. 「GM モードは、いまは限られた人だけが使えます」の画面に、そのアカウントの ID が出るので控える。
3. Firebase コンソールの Realtime Database →「データ」で、いちばん上に `gmAllow` を作り、その下に「キー：控えた ID、値：`true`」を追加する。
4. `#/gm` を開き直すと、GM 画面が使える。

- 許可をやめるときは、その ID の行を消す（作ってあったゲームは、そのまま進行・削除できる）。
- 許可の一覧はセキュリティルールで守っていて、コンソール以外からは書き換えられない。リポジトリにはだれの情報も書かない。

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
