import { importProject, validateProject, type RobotProject } from "./projects.ts"

/** Validate an existing cloud record without discarding future fields or rewriting unrelated programs. */
export function preserveStoredProject(value: unknown): RobotProject {
  const clean = validateProject(value)
  if (clean.hub !== "spike" && clean.hub !== "ev3") throw new Error("Тип робота не поддерживается.")
  return value as RobotProject
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">
export type EditorProjectDraft = {
  key: string; token: string; userId: string; projectId: string; baseRaw: string | null;
  projects: RobotProject[]; savedAt: string;
}
export const editorProjectDraftPrefix = (userId: string, version: 1 | 2 = 1) => `tlc-editor-program-draft:v${version}:${userId}:`
export function createEditorProjectDraft(userId: string, tabId: string, projectId: string, projects: RobotProject[], baseRaw: string | null, token: string, version: 1 | 2 = 1): EditorProjectDraft {
  const key = `${editorProjectDraftPrefix(userId, version)}${tabId}:${encodeURIComponent(projectId)}`
  return { key, token, userId, projectId, projects: projects.filter(project => project.id === projectId).map(preserveStoredProject), baseRaw: JSON.stringify((JSON.parse(baseRaw || "[]") as RobotProject[]).filter(project => project.id === projectId)), savedAt: new Date().toISOString() }
}
export function writeEditorProjectDraft(storage: DraftStorage, userId: string, tabId: string, projectId: string, projects: RobotProject[], baseRaw: string | null, token: string): EditorProjectDraft {
  const draft = createEditorProjectDraft(userId, tabId, projectId, projects, baseRaw, token)
  const raw = JSON.stringify(draft)
  storage.setItem(draft.key, raw)
  if (storage.getItem(draft.key) !== raw) throw new Error("Не удалось подтвердить резервную копию программы.")
  return draft
}
export function parseEditorProjectDraft(key: string, raw: string, userId: string): EditorProjectDraft | null {
  if (!key.startsWith(editorProjectDraftPrefix(userId, 1)) && !key.startsWith(editorProjectDraftPrefix(userId, 2))) return null
  try {
    const draft = JSON.parse(raw) as EditorProjectDraft
    if (!draft || draft.key !== key || draft.userId !== userId || typeof draft.projectId !== "string" || typeof draft.token !== "string" || typeof draft.savedAt !== "string" || !(draft.baseRaw === null || typeof draft.baseRaw === "string") || !Array.isArray(draft.projects)) return null
    if (!key.endsWith(`:${encodeURIComponent(draft.projectId)}`) || !Number.isFinite(Date.parse(draft.savedAt)) || !draft.projects.some(project => project.id === draft.projectId)) return null
    draft.projects.forEach(preserveStoredProject)
    const base = JSON.parse(draft.baseRaw || "[]")
    if (!Array.isArray(base)) return null
    base.forEach(preserveStoredProject)
    return draft
  } catch { return null }
}
export function readEditorProjectDrafts(storage: DraftStorage, userId: string): EditorProjectDraft[] {
  const result: EditorProjectDraft[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(editorProjectDraftPrefix(userId, 1))) continue
    const raw = storage.getItem(key)
    if (!raw) continue
    const draft = parseEditorProjectDraft(key, raw, userId)
    if (draft) result.push(draft)
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
  const next = JSON.stringify({ ...current, baseRaw: JSON.stringify((JSON.parse(acknowledgedRaw) as RobotProject[]).filter(project => project.id === draft.projectId)) })
  storage.setItem(draft.key, next)
  if (storage.getItem(draft.key) !== next) throw new Error("Не удалось обновить резервную копию программы.")
}


export async function legacyProjectFingerprint(source: string): Promise<string> {
  const bytes = new TextEncoder().encode(source)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")
}

/** Persist IDs before any cloud write, so retrying a failed import is idempotent. */
export async function prepareLegacyProjectCopies(storage: DraftStorage, userId: string, source: string, local: RobotProject[]): Promise<RobotProject[]> {
  const key = `tlc-account-projects-import-plan:${userId}`
  const fingerprint = await legacyProjectFingerprint(source)
  let ids: string[] | null = null, time = new Date().toISOString()
  try {
    const saved = JSON.parse(storage.getItem(key) || "null")
    if (saved?.fingerprint === fingerprint && Array.isArray(saved.ids) && saved.ids.length === local.length && saved.ids.every((id: unknown) => typeof id === "string" && id.length > 0) && new Set(saved.ids).size === saved.ids.length && Number.isFinite(Date.parse(saved.time))) {
      ids = saved.ids; time = saved.time
    } else if (saved?.source === source && Array.isArray(saved.copies) && saved.copies.length === local.length) {
      const copies = saved.copies.map(preserveStoredProject) as RobotProject[]
      ids = copies.map(project => project.id); time = copies[0]?.createdAt || time
    }
  } catch { /* Original browser projects remain untouched. */ }
  if (!ids) ids = local.map(() => crypto.randomUUID())
  const raw = JSON.stringify({ fingerprint, ids, time })
  storage.setItem(key, raw)
  if (storage.getItem(key) !== raw) throw new Error("Не удалось сохранить план копирования. Исходные программы остаются в браузере.")
  return local.map((project, index) => ({ ...project, ...importProject(JSON.stringify(project), ids![index], new Date(time)) }))
}

const projectCachePrefix = (userId: string) => `tlc-account-project-cache:v2:${userId}:`
/** Optional cache is bounded; never remove recovery records to make space for it. */
export function cacheAccountProjects(storage: DraftStorage, userId: string, projects: RobotProject[]) {
  const prefix = projectCachePrefix(userId), selected = new Map<string, string>()
  let total = 0
  for (const project of projects.slice().sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))) {
    const raw = JSON.stringify(project), size = new TextEncoder().encode(raw).byteLength
    if (size > 100_000 || total + size > 500_000) continue
    selected.set(`${prefix}${encodeURIComponent(project.id)}`, raw); total += size
  }
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index)
    if (key?.startsWith(prefix) && !selected.has(key)) storage.removeItem(key)
  }
  for (const [key, raw] of selected) {
    try { if (storage.getItem(key) !== raw) storage.setItem(key, raw) } catch { break }
  }
  try { storage.removeItem(`tlc-account-projects-backup:${userId}`) } catch { /* Old aggregate cache is optional too. */ }
}
export function cachedAccountProjects(storage: DraftStorage, userId: string): RobotProject[] {
  const result: RobotProject[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (!key?.startsWith(projectCachePrefix(userId))) continue
    try { result.push(preserveStoredProject(JSON.parse(storage.getItem(key) || "null"))) } catch { /* Ignore corrupt optional cache entries. */ }
  }
  return result
}
