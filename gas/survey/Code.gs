// レモネードスタンドのユーザーアンケートを受け取り、このスプレッドシートに1行ずつ追加する GAS。
// スプレッドシートの「拡張機能 → Apps Script」に貼り、ウェブアプリとして公開して使う（README 参照）。
// 個人を特定する情報は受け取らない。数値や選択肢は決まった範囲だけ、自由記述は長さを制限して保存する。

var SHEET_NAME = '回答';
var HEADERS = ['受付日時', '回答者', '楽しさ', 'わかりやすさ', '難しさ', '学び', '授業で使いたい', '使う場面', 'コメント',
  'きっかけ', '市場のパターン', 'むずかしさ', '順位', 'チーム数', '1年のもうけ', '端末', 'バージョン', '言語'];
var ROLE_LABELS = { elementary: '小学生', junior: '中学生', high: '高校生', adult: '大人', teacher: '教育関係者' };
var DIFFICULTY_LABELS = { easy: 'やさしすぎ', right: 'ちょうどいい', hard: 'むずかしすぎ' };
var SCENES = ['小学校', '中学校', '高校', '大学・社会人研修', '家庭・その他'];
var COMMENT_MAX = 1000;
var MAX_PER_MINUTE = 60; // いたずらで大量に送られたときの上限（1分あたり）

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // ルームモードのゲームの記録（ログ）は、別のシートに1行ずつ
    var isLog = data && data.kind === 'gameLog';
    var row = isLog ? toLogRow_(data, new Date()) : toRow_(data, new Date());
    if (!row) return json_({ ok: false });
    if (!withinRateLimit_()) return json_({ ok: false });
    (isLog ? logSheet_() : sheet_()).appendRow(row);
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
    c.lang === 'en' ? '英語' : '日本語',
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
  // 列が増えたとき（例：「言語」）に、見出しの行を最新にそろえる
  else if (sh.getRange(1, HEADERS.length).getValue() !== HEADERS[HEADERS.length - 1]) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

// ---- ルームモードのゲームの記録（ログ） ----

var LOG_SHEET_NAME = 'ログ';
var LOG_SEATS = 4;
var LOG_KINDS = { human: '人', discount: 'ロボット（安売り）', premium: 'ロボット（高値）', follower: 'ロボット（追随）', cautious: 'ロボット（慎重）' };
var LOG_HEADERS = (function () {
  var h = ['受付日時', 'モード', 'ルームコード', 'むずかしさ', '市場のパターン', '人', 'ロボット', '月数'];
  for (var i = 1; i <= LOG_SEATS; i++) h.push(i + '位 お店', i + '位 種類', i + '位 もうけ', i + '位 お金の残り', i + '位 平均の値段', i + '位 売れた杯数');
  h.push('市場の大きさ（月ごと）', 'バージョン');
  return h;
})();

// 受け取った記録を1行にする。おかしなデータなら null（保存しない）
function toLogRow_(d, now) {
  if (d.v !== 1 || d.mode !== 'room') return null;
  if (!Array.isArray(d.teams) || d.teams.length === 0 || d.teams.length > LOG_SEATS) return null;
  if (!Array.isArray(d.budgets) || d.budgets.length > 120) return null;
  var row = [now, 'ルーム', text_(d.code, 6), text_(d.difficulty, 10), text_(d.pattern, 20), int_(d.humans), int_(d.robots), int_(d.months)];
  for (var i = 0; i < LOG_SEATS; i++) {
    var t = d.teams[i];
    if (!t) { row.push('', '', '', '', '', ''); continue; }
    if (!LOG_KINDS.hasOwnProperty(t.kind)) return null;
    row.push(text_(t.name, 30), LOG_KINDS[t.kind], int_(t.profit), int_(t.balance), t.avgPrice === null ? '' : int_(t.avgPrice), int_(t.sold));
  }
  row.push(d.budgets.map(function (b) { return int_(b); }).join(','), text_(d.appVersion, 40));
  return row;
}

function logSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_SHEET_NAME) || ss.insertSheet(LOG_SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(LOG_HEADERS);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
