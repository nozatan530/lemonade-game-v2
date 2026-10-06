// 全体表示（プロジェクター・画面共有）を、もう1つの画面に出すための部品。
// - GM 画面から：つながっている別の画面（拡張ディスプレイ）があれば、そこにウィンドウを開く
//   （Chrome / Edge の「ウィンドウの管理」の許可を使う。使えないブラウザでは新しいウィンドウを開くだけ）
// - 全体表示の画面で：大きなボタン1回で全画面にする（ブラウザの決まりで、全画面には1回のクリックが必要）

interface ScreenLike { availLeft: number; availTop: number; availWidth: number; availHeight: number; isPrimary?: boolean }
interface ScreenDetailsLike { screens: ScreenLike[]; currentScreen: ScreenLike }

// 開いたウィンドウ（2回目からは同じウィンドウを使う）
const WINDOW_NAME = 'lemonade-screen';

export async function openOnOtherScreen(url: string): Promise<'other' | 'window' | 'blocked'> {
  const w = window as unknown as { getScreenDetails?: () => Promise<ScreenDetailsLike> };
  const canPlace = typeof w.getScreenDetails === 'function';
  // すでに許可されていれば、すぐに画面の配置がわかる（許可を聞く画面は出ない）
  let granted = false;
  if (canPlace) {
    try {
      const st = await navigator.permissions.query({ name: 'window-management' as PermissionName });
      granted = st.state === 'granted';
    } catch { /* この許可を知らないブラウザ */ }
  }
  if (granted) {
    const other = await otherScreen(w.getScreenDetails!);
    if (other) {
      const win = window.open(url, WINDOW_NAME, `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`);
      if (!win) return 'blocked';
      win.focus();
      return 'other';
    }
  }
  // まだ許可がない：先にウィンドウを開き（クリックの直後でないと開けないため）、許可が出たらもう1つの画面へ移す
  const win = window.open(url, WINDOW_NAME, 'popup,width=1280,height=720');
  if (!win) return 'blocked';
  win.focus();
  if (!canPlace) return 'window';
  const other = await otherScreen(w.getScreenDetails!);
  if (!other) return 'window';
  try {
    win.moveTo(other.availLeft, other.availTop);
    win.resizeTo(other.availWidth, other.availHeight);
    return 'other';
  } catch {
    return 'window';
  }
}

// 今の画面とは別の画面（なければ null）。許可を聞く画面に答えないまま待ち続けないよう、20秒で打ち切る
async function otherScreen(get: () => Promise<ScreenDetailsLike>): Promise<ScreenLike | null> {
  try {
    const details = await Promise.race([
      get(),
      new Promise<null>((r) => setTimeout(() => r(null), 20000)),
    ]);
    if (!details) return null;
    return details.screens.find((s) => s !== details.currentScreen) ?? null;
  } catch {
    return null;
  }
}

// 全体表示の画面に「全画面にする」ボタンを出す。全画面になったら隠れ、F キーでも切りかえられる
export function mountFullscreenButton(container: HTMLElement): () => void {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'present-btn';
  btn.textContent = '⛶ クリックで全画面にする（F キー）';
  container.appendChild(btn);
  const sync = () => { btn.hidden = !!document.fullscreenElement; };
  const toggle = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'f' || e.key === 'F') toggle(); };
  btn.addEventListener('click', toggle);
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('keydown', onKey);
  sync();
  return () => {
    btn.remove();
    document.removeEventListener('fullscreenchange', sync);
    document.removeEventListener('keydown', onKey);
  };
}
