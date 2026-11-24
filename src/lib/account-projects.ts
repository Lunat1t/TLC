import { importProject, validateProject, type RobotProject } from "./projects.ts"

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">
export type EditorProjectDraft = {
  key: string; token: string; userId: string; projectId: string; baseRaw: string | null;
  projects: RobotProject[]; savedAt: string;
}
const draftPrefix = (userId: string) => `tlc-editor-program-draft:v1:${userId}:`
export function writeEditorProjectDraft(storage: DraftStorage, userId: string, tabId: string, projectId: string, projects: RobotProject[], baseRaw: string | null, token: string): EditorProjectDraft {
  const key = `${draftPrefix(userId)}${tabId}:${encodeURIComponent(projectId)}`
  const draft: EditorProjectDraft = { key, token, userId, projectId, projects: projects.map(validateProject), baseRaw, savedAt: new Date().toISOString() }
  const raw = JSON.stringify(draft)
  storage.setItem(key, raw)
  if (storage.getItem(key) !== raw) throw new Error("Не удалось подтвердить резервную копию программы.")
  return draft
}
export function readEditorProjectDrafts(storage: DraftStorage, userId: string): EditorProjectDraft[] {
  const result: EditorProjectDraft[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(draftPrefix(userId))) continue
    try {
      const draft = JSON.parse(storage.getItem(key) || "null") as EditorProjectDraft
      if (!draft || draft.key !== key || draft.userId !== userId || typeof draft.projectId !== "string" || typeof draft.token !== "string" || typeof draft.savedAt !== "string" || !(draft.baseRaw === null || typeof draft.baseRaw === "string") || !Array.isArray(draft.projects)) continue
      if (!key.endsWith(`:${encodeURIComponent(draft.projectId)}`) || !Number.isFinite(Date.parse(draft.savedAt)) || !draft.projects.some(project => project.id === draft.projectId)) continue
      draft.projects.forEach(validateProject)
      const base = JSON.parse(draft.baseRaw || "[]")
      if (!Array.isArray(base)) continue
      base.forEach(validateProject)
      result.push(draft)
    } catch { /* Never remove an unreadable recovery copy. */ }
  }
  return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}
/** An older queued acknowledgement must never remove a newer editor snapshot. */
export function clearEditorProjectDraft(storage: DraftStorage, draft: EditorProjectDraft): boolean {
  try {
    const current = storage.getItem(draft.key)
    if (!current || JSON.parse(current).token !== draft.token) return false
    storage.removeItem(draft.key)
    return true
  } catch { return false }
}


/** Rebase newer edits from this editor after an earlier queued write is acknowledged. */
export function acknowledgeEditorProjectDraft(storage: DraftStorage, draft: EditorProjectDraft, acknowledgedRaw: string): void {
  const raw = storage.getItem(draft.key)
  if (!raw) return
  const current = JSON.parse(raw) as EditorProjectDraft
  if (current.userId !== draft.userId || current.projectId !== draft.projectId || current.key !== draft.key) return
  if (current.token === draft.token) {
    storage.removeItem(draft.key)
    return
  }
  // The fresh editor-instance key cannot be shared with another active tab.
  const next = JSON.stringify({ ...current, baseRaw: acknowledgedRaw })
  storage.setItem(draft.key, next)
  if (storage.getItem(draft.key) !== next) throw new Error("Не удалось обновить резервную копию программы.")
}


/** Persist IDs before any cloud write, so retrying a failed import is idempotent. */
export function prepareLegacyProjectCopies(storage: DraftStorage, userId: string, source: string, local: RobotProject[]): RobotProject[] {
  const key = `tlc-account-projects-import-plan:${userId}`
  try {
    const saved = JSON.parse(storage.getItem(key) || "null")
    if (saved?.source === source && Array.isArray(saved.copies)) return saved.copies.map(validateProject)
  } catch { /* Original browser projects remain untouched. */ }
  const copies = local.map(project => importProject(JSON.stringify(project), crypto.randomUUID()))
  const raw = JSON.stringify({ source, copies })
  storage.setItem(key, raw)
  if (storage.getItem(key) !== raw) throw new Error("Не удалось сохранить план копирования. Исходные программы остаются в браузере.")
  return copies
}
