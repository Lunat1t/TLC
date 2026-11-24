type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">
export type NoteDraft = { text: string; base: string; savedAt: string }
export const noteDraftPrefix = (userId: string, noteId: string) => `tlc-note-draft:${userId}:${encodeURIComponent(noteId)}:`
export function readNoteDrafts(storage: DraftStorage, userId: string, noteId: string): { key: string; raw: string; value: NoteDraft }[] {
  const drafts = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (!key?.startsWith(noteDraftPrefix(userId, noteId))) continue
    const raw = storage.getItem(key)
    if (!raw) continue
    try {
      const value = JSON.parse(raw)
      if (typeof value.text === "string" && value.text.length <= 300 && typeof value.base === "string" && Number.isFinite(Date.parse(value.savedAt))) drafts.push({ key, raw, value: value as NoteDraft })
    } catch { /* Leave unreadable data untouched. */ }
  }
  return drafts.sort((a, b) => b.value.savedAt.localeCompare(a.value.savedAt))
}
export function writeNoteDraft(storage: DraftStorage, userId: string, noteId: string, instance: string, text: string, base: string) {
  const key = `${noteDraftPrefix(userId, noteId)}${instance}`
  const raw = JSON.stringify({ text, base, savedAt: new Date().toISOString() })
  storage.setItem(key, raw)
  if (storage.getItem(key) !== raw) throw Error("Не удалось сохранить черновик заметки.")
}
export function archiveNoteDrafts(storage: DraftStorage, userId: string, noteId: string) {
  for (const { key, raw } of readNoteDrafts(storage, userId, noteId)) {
    const archive = `tlc-note-archive:${userId}:${encodeURIComponent(noteId)}:${crypto.randomUUID()}`
    storage.setItem(archive, raw)
    if (storage.getItem(archive) !== raw) throw Error("Не удалось сохранить резервную копию заметки.")
    if (storage.getItem(key) === raw) storage.removeItem(key)
  }
}
