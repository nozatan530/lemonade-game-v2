// レモネードスタンドのユーザーアンケートを受け取り、このスプレッドシートに1行ずつ追加する GAS。
// スプレッドシートの「拡張機能 → Apps Script」に貼り、ウェブアプリとして公開して使う（README 参照）。
// 個人を特定する情報は受け取らない。数値や選択肢は決まった範囲だけ、自由記述は長さを制限して保存する。

var SHEET_NAME = '回答';
var HEADERS = ['受付日時', '回答者', '楽しさ', 'わかりやすさ', '難しさ', '学び', '授業で使いたい', '使う場面', 'コメント',
  'きっかけ', '市場のパターン', 'むずかしさ', '順位', 'チーム数', '1年のもうけ', '端末', 'バージョン'];
var ROLE_LABELS = { elementary: '小学生', junior: '中学生', high: '高校生', adult: '大人', teacher: '教育関係者' };
var DIFFICULTY_LABELS = { easy: 'やさしすぎ', right: 'ちょうどいい', hard: 'むずかしすぎ' };
var SCENES = ['小学校', '中学校', '高校', '大学・社会人研修', '家庭・その他'];
var COMMENT_MAX = 1000;
var MAX_PER_MINUTE = 60; // いたずらで大量に送られたときの上限（1分あたり）

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var row = toRow_(data, new Date());
    if (!row) return json_({ ok: false });
    if (!withinRateLimit_()) return json_({ ok: false });
    sheet_().appendRow(row);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false });
  }
}

// 動いているかの確認用
function doGet() {
  return json_({ ok: true });
}

// 受け取ったデータを1行分の配列にする。おかしなデータなら null（保存しない）
function toRow_(d, now) {
  if (!d || d.v !== 1) return null;
  if (typeof d.hp === 'string' && d.hp !== '') return null; // いたずら対策の欄に入力がある
  if (!ROLE_LABELS.hasOwnProperty(d.role)) return null;
  var a = d.answers || {};
  var c = d.context || {};
  var fun = scale_(a.fun), clarity = scale_(a.clarity), learning = scale_(a.learning);
  if (fun === null || clarity === null || learning === null) return null;
  if (!DIFFICULTY_LABELS.hasOwnProperty(a.difficulty)) return null;
  var useInClass = a.useInClass === undefined ? '' : scale_(a.useInClass);
  if (useInClass === null) return null;
  var scenes = Array.isArray(a.scenes) ? a.scenes.filter(function (s) { return SCENES.indexOf(s) >= 0; }) : [];
  return [
    now,
    ROLE_LABELS[d.role],
    fun,
    clarity,
    DIFFICULTY_LABELS[a.difficulty],
    learning,
    useInClass,
    scenes.join('、'),
    text_(a.comment, COMMENT_MAX),
    text_(c.source, 20),
    text_(c.pattern, 20),
    text_(c.difficulty, 20),
    int_(c.rank),
    int_(c.teams),
    int_(c.profit),
    text_(c.device, 10),
    text_(c.appVersion, 40),
  ];
}

function scale_(n) {
  return typeof n === 'number' && n >= 1 && n <= 5 && Math.floor(n) === n ? n : null;
}

function int_(n) {
  return typeof n === 'number' && isFinite(n) ? Math.round(n) : '';
}

// 文字は長さを制限し、先頭が = + - @ のときは式として動かないように ' を付ける
function text_(s, max) {
  if (typeof s !== 'string') return '';
  var t = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, max);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function withinRateLimit_() {
  var cache = CacheService.getScriptCache();
  var key = 'count-' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(key) || '0') + 1;
  cache.put(key, String(n), 120);
  return n <= MAX_PER_MINUTE;
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
