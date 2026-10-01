// 「提出する」「次の月へ」を押したあとの待ち画面（ルームモード・ワークショップモードで共通）。
// みんな同じ画面なので、だれが最後に押したか分からない
export function preparingHtml(sub: string, canEdit: boolean): string {
  return `<div class="card center preparing" style="min-height:55vh;display:flex;flex-direction:column;justify-content:center;align-items:center">
      <div class="wobble" style="font-size:3rem;line-height:1">🍋</div>
      <h2 style="margin:12px 0 6px">他チームの準備中…</h2>
      <p class="muted" style="margin:0">${sub}</p>
      ${canEdit ? '<p style="margin:12px 0 0"><button class="small secondary" id="editAgain" type="button">決定をなおす</button></p>' : ''}
    </div>`;
}
