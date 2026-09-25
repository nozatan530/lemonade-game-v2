# CLAUDE.md — レモネードスタンド経営シミュレーション

## このプロジェクトについて
教育用の経営シミュレーションゲーム。複数の販売チームが同じ市場でレモネードを販売し、12か月（1期）の利益を競う。ゲームマスター（GM）が進行する。

- 実施時間：**1コマ50分で12か月**を回すことが最優先の制約
- 実施の場：学校の授業、オンライン講座、学校外のワークショップ
- 学びたいこと：原価・人件費・固定費、販売のための費用、市場や時期による購買行動の変化、競合がいる中での販売戦略、期末の振り返り

ゲームのルールと計算式の正本は `docs/game-design.md`。仕様で迷ったらまずそこを読むこと。

## 技術スタックと前提
**Firebaseは無料のSparkプランで運用する。** Cloud Functionsなど、Blazeプランが必要な機能は使わない。

- フロントエンド：Vite + TypeScript（フレームワークなし。必要になったら相談）
- ビルド結果：静的ファイルのみ。**Firebase HostingでもGitHub Pagesでも動くこと**（相対パスでビルドする）
- リアルタイム同期：Firebase Realtime Database
- 認証：Firebase Authentication
  - GM：メール／パスワードまたはGoogleログイン
  - 販売チーム：匿名認証（個人情報なしでセキュリティルールを効かせるため）
- Gemini API：**GAS（Google Apps Script）のWebアプリを中継役にして呼ぶ**。GASのコードは `gas/` に置き、clasp で管理する
- テスト：Vitest

### Sparkプランの制約（設計時に必ず考慮する）
- Realtime Databaseの同時接続は **100まで**。1ゲームで使う接続数を少なく保つ（全体表示・GM・チーム端末のみ接続し、不要な接続は閉じる）
- サーバー側の処理はない。市場の計算は **GMの端末で** engineを実行し、結果をデータベースに書き込む
- データの削除も自動では行えない。GMの操作と、新規ゲーム作成時の掃除処理で行う

## フォルダ構成
```
lemonade-game/
├── CLAUDE.md
├── README.md                  # 起動・デプロイ方法（Firebase Hosting／GitHub Pages両方）
├── docs/
│   ├── game-design.md         # ルール・計算式の正本
│   ├── learning-goals.md      # 学習目的と、それを支えるゲーム要素
│   ├── facilitation-guide.md  # GM向け進行ガイド（50分の台本）
│   ├── decisions.md           # 設計判断の記録（日付・判断・理由）
│   └── prompts/               # Geminiのプロンプト（AI Studioで検証済みの版を置く）
├── src/
│   ├── engine/                # ゲームの計算。純粋関数のみ（DOM・Firebase禁止）
│   │   ├── types.ts
│   │   ├── config.ts          # 難易度・実施モード・初期値
│   │   ├── scenarios/         # シナリオ（季節係数・イベント・原価変動）
│   │   ├── demand.ts          # 市場予算と顧客層
│   │   ├── market.ts          # 購買の配分
│   │   ├── inventory.ts       # 在庫と繰越
│   │   ├── accounting.ts      # 月次損益・期末決算
│   │   ├── reputation.ts      # 評判の持ち越し
│   │   ├── cpu-teams.ts       # CPUチームの意思決定
│   │   ├── month.ts           # 1か月分の処理（各計算をまとめる）と未提出チームの補完
│   │   ├── random.ts          # シード付き乱数（同じシードなら同じ結果）
│   │   └── __tests__/
│   ├── sync/                  # Firebaseとのやりとり（engineの外側）
│   ├── ai/                    # GAS中継の呼び出しと、Geminiオフ時のテンプレート文
│   ├── screens/
│   │   ├── gm/                # GM画面（設定・進行・強制締切・終了と削除）
│   │   ├── team/              # 販売チーム画面（スマホ優先）
│   │   ├── dashboard/         # 全体表示（プロジェクター・画面共有用）
│   │   └── report/            # 期末レポート
│   ├── ui/                    # 共通部品（スライダー、タイマー、グラフ）
│   └── main.ts
├── gas/                       # Gemini中継用のGAS（clasp管理）
│   ├── Code.gs
│   └── appsscript.json
├── legacy/                    # 旧版の単一HTML（参照用。編集しない）
├── database.rules.json        # Realtime Databaseのセキュリティルール
├── firebase.json
└── package.json
```

## 開発ルール
1. **計算は `src/engine/` にだけ書く。** 画面やFirebaseのコードに計算式を書かない。engineは「状態と入力を受け取り、新しい状態を返す」純粋関数にする。乱数はシード付きにし、同じ入力なら必ず同じ結果になるようにする（もしもリプレイと検証のため）。
2. **engineを変更したら必ずテストを追加・更新する。** 特に購買配分、損益、在庫繰越。
3. **市場の計算はGMの端末だけが行う。** 販売チームの端末は自分の決定を書き込むだけ。セキュリティルールで、チームは自分のチームのデータにしか書き込めないようにする。
4. **数値はAIに決めさせない。** Geminiに任せるのは文章（ニュース、顧客の声、講評）だけ。売上・利益・配分はすべてengineが決める。
5. **Geminiはオプション機能。** オフでも `src/ai/` のテンプレート文で動くこと。GASへの呼び出しが失敗・遅延した場合も、テンプレート文に切り替えて進行を止めない。
6. **秘密情報をリポジトリに書かない。** GeminiのAPIキーはGASのスクリプトプロパティにだけ置く。GMのパスワードをHTMLやJSに書かない。FirebaseのWeb用設定値（apiKeyなど）は公開前提の値なので書いてよいが、守りはセキュリティルールで行う。
7. **個人情報を扱わない。** 参加者はチーム名だけで識別する。GMはゲーム終了時にデータを削除できる。
8. **50分の制約を守る。** 販売チームの毎月の操作が増える変更をするときは、1か月あたりの所要時間（目標約3分）への影響を説明してから実装する。
9. **Sparkプランの範囲に収める。** Blazeが必要になる変更を提案するときは、理由と代替案を先に示す。
10. 仕様を変えたら `docs/game-design.md` も更新し、大きな判断は `docs/decisions.md` に記録する。

## GAS中継の約束事
- GASはGMからの呼び出しだけを受け付ける。リクエストにはゲームコードを含め、GASはRealtime Database（REST）でそのゲームが進行中かを確認してから処理する。
- 1ゲームあたりの呼び出し回数に上限を設ける（例：30回）。CacheServiceかPropertiesServiceで数える。
- ブラウザからの送信は `Content-Type: text/plain` でJSON文字列を送る（CORSのプリフライトを避けるため）。
- 応答はJSONで返し、失敗時は `{ ok: false }` を返す。フロント側はそれを受けてテンプレート文に切り替える。
- Google Cloud側で、APIキーの利用上限と予算アラートを設定しておく（README に手順を書く）。

## 用語（画面・コード・ドキュメントで統一）
| 日本語 | コード上の名前 |
|---|---|
| ゲームマスター（GM） | gm |
| 販売チーム | team |
| CPUチーム | cpuTeam |
| 期（12か月） | term |
| 月 | month（1〜12） |
| 四半期の決定 | quarterlyDecision |
| 月の決定 | monthlyDecision |
| 評判 | reputation |
| ゲームコード | gameCode |

UIの文言は日本語。子どもから大人まで使うので、専門用語には短い説明を添える。

## 作業の進め方
- 大きな変更は、実装前に計画（変更するファイル・影響範囲）を示して確認をとる。
- 1回の作業は1つの機能に絞り、動く状態で終える。
- 迷ったら「50分で回せるか」「参加者が数字の意味を理解できるか」「Sparkプランで動くか」を判断基準にする。

## よく使うコマンド
```
npm run dev              # 開発サーバー
npm test                 # テスト
npm run build            # ビルド（dist/ に静的ファイル）
firebase deploy --only hosting,database   # Firebase Hostingへデプロイ
cd gas && clasp push     # GASへ反映
```
