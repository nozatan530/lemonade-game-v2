// 開いたままの古い画面が、新しい版の公開に気づいて読みこみ直す。
// ルームの画面を開いたときに version.json（キャッシュしない）を見て、ビルド番号がちがえば1回だけ再読みこみする。
export async function reloadIfStale(): Promise<void> {
  if (import.meta.env.DEV) return;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { build } = (await res.json()) as { build?: string };
    if (!build || build === __BUILD_ID__) return;
    const key = `reloadedFor-${build}`;
    if (sessionStorage.getItem(key)) return; // 何度も読みこみ直さない
    sessionStorage.setItem(key, '1');
    location.reload();
  } catch {
    // 調べられなくても遊びには影響しない
  }
}
