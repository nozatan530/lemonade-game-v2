// 「現実ベースの変動」で使う季節のデータ（暦の1月〜12月）。

// お客さんの数（市場の大きさ）の季節の指数。レモネードの月別の消費量・売上の調査（年平均＝100の指数）より。
// 12か月の平均は 106.25 になるので、使うときは平均で割って「1年の平均が1」の倍率にする（docs/game-design.md）。
const MARKET_INDEX = [50, 55, 75, 95, 115, 130, 220, 210, 120, 80, 65, 60];
const MARKET_INDEX_MEAN = MARKET_INDEX.reduce((a, b) => a + b, 0) / MARKET_INDEX.length;

export function marketSeasonMultiplier(calendarMonth: number): number {
  return MARKET_INDEX[calendarMonth - 1]! / MARKET_INDEX_MEAN;
}

// レモンの値段の形。7月がいちばん高く、8月から下がりはじめ、9月に急に下がり、1月がいちばん安い（7月の1/3）。
// 平均で割って使うので、1年の平均は初期単価（80円）になる。
const LEMON_SEASON = [1.0, 1.2, 1.5, 1.9, 2.3, 2.7, 3.0, 2.7, 1.7, 1.4, 1.2, 1.1];
const LEMON_SEASON_MEAN = LEMON_SEASON.reduce((a, b) => a + b, 0) / LEMON_SEASON.length;

export function lemonSeasonMultiplier(calendarMonth: number): number {
  return LEMON_SEASON[calendarMonth - 1]! / LEMON_SEASON_MEAN;
}

// 毎月のお知らせ（市場の調査の説明を、子どもにもわかる短い文にしたもの）
export const SEASON_NEWS = [
  '❄️ 寒くて、つめたい飲み物はあまり売れない季節。ホットレモネードが中心です。',
  '❄️ まだ寒いけれど、かぜ予防のビタミンCで、少しだけ売れはじめています。',
  '🌸 あたたかくなってきました。春夏の新しいレモネードがお店にならびはじめます。',
  '🌸 新生活やおでかけの季節。売れ行きが少しずつ上がってきました。',
  '🌤 初夏の陽気で、シュワッとしたレモネードが急に売れはじめました。',
  '☔ 梅雨のむし暑さで、すっきりした味がほしい人がふえています。',
  '🔥 猛暑と夏祭り！ 1年でいちばん売れる時期です。',
  '🏖 夏休みで、7月に続いて大にぎわい。',
  '🍂 残暑はあるけれど、月の半ばから売れ行きが落ちはじめます。',
  '🍂 秋が深まり、つめたい飲み物から温かい飲み物へ人気が移っています。',
  '🧣 冬の入り口。お店に温かい飲み物がならびはじめました。',
  '🎄 クリスマスなどで少し売れるけれど、ふだんはあまり売れません。',
];
