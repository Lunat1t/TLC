"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAccountWorkspace } from "./account-workspace"
import {
  STORAGE_KEY, loadProjects, prepareEditorProjects, saveEditorProjects,
  validateProject, type RobotProject,
} from "@/lib/projects"
import { migrateControlWorkspace } from "@/lib/control-workspace"
import { prepareLegacyProjectCopies, writeEditorProjectDraft, readEditorProjectDrafts, acknowledgeEditorProjectDraft, clearEditorProjectDraft, type EditorProjectDraft } from "@/lib/account-projects"

const LOCAL_PROJECTS_CHANGED = "tlc-local-projects-changed"
const cacheKey = (userId: string) => `tlc-account-projects-backup:${userId}`
const importKey = (userId: string) => `tlc-account-projects-imported:${userId}`

function parseProjects(value: unknown): RobotProject[] {
  if (!Array.isArray(value)) throw new Error("Список программ повреждён. Скачайте резервную копию.")
  return value.map(validateProject)
}

/** The account workspace owns cloud revisions; legacy browser programs remain separate. */
export function useAccountProjects() {
  const store = useAccountWorkspace()
  const [localRaw, setLocalRaw] = useState<string | null>(null)
  const [localError, setLocalError] = useState("")
  const [importedRaw, setImportedRaw] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EditorProjectDraft[]>([])
  const draftTabId = useRef<string | null>(null)

  useEffect(() => {
    function readLocal() {
      try {
        setLocalRaw(localStorage.getItem(STORAGE_KEY))
        setImportedRaw(store.userId ? localStorage.getItem(importKey(store.userId)) : null)
        setDrafts(store.userId ? readEditorProjectDrafts(localStorage, store.userId) : [])
        setLocalError("")
      } catch { setLocalError("Не удалось прочитать программы этого браузера.") }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null || event.key === (store.userId && importKey(store.userId)) || Boolean(store.userId && event.key?.startsWith(`tlc-editor-program-draft:v1:${store.userId}:`))) readLocal()
    }
    readLocal()
    window.addEventListener("storage", onStorage)
    window.addEventListener(LOCAL_PROJECTS_CHANGED, readLocal)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(LOCAL_PROJECTS_CHANGED, readLocal)
    }
  }, [store.userId])

  const snapshot = useMemo(() => {
    try {
      const value = store.userId ? store.values.projects ?? [] : JSON.parse(localRaw || "[]")
      return { projects: parseProjects(value), raw: store.userId ? JSON.stringify(value) : localRaw, error: "" }
    } catch (error) {
      return { projects: [] as RobotProject[], raw: store.userId ? JSON.stringify(store.values.projects ?? []) : localRaw,
        error: error instanceof Error ? error.message : "Не удалось прочитать программы." }
    }
  }, [store.userId, store.values.projects, localRaw])
  const error = store.error || snapshot.error || (!store.userId ? localError : "")
  const ready = store.ready && !snapshot.error && (Boolean(store.userId) || !localError)
  const latest = useRef({ store, snapshot, ready, error, localRaw })
  latest.current = { store, snapshot, ready, error, localRaw }

  useEffect(() => {
    if (store.userId && ready) {
      try { localStorage.setItem(cacheKey(store.userId), snapshot.raw || "[]") } catch {}
    }
  }, [store.userId, ready, snapshot.raw])

  const save = useCallback(async (projects: RobotProject[], expectedRaw: string | null): Promise<string> => {
    const current = latest.current
    if (!current.ready) throw new Error(current.error || "Дождитесь загрузки программ.")
    const clean = projects.map(validateProject)
    if (!current.store.userId) {
      const raw = await saveEditorProjects(localStorage, clean, expectedRaw, navigator.locks)
      setLocalRaw(raw)
      window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
      return raw
    }
    const expected = JSON.parse(expectedRaw || "[]")
    parseProjects(expected)
    await current.store.save("projects", clean, expected)
    const raw = JSON.stringify(clean)
    try { localStorage.setItem(cacheKey(current.store.userId), raw) } catch {}
    return raw
  }, [])

  const prepare = useCallback(async (projectId: string): Promise<{ projects: RobotProject[]; raw: string | null; readOnly?: boolean }> => {
    const current = latest.current
    if (!current.ready) throw new Error(current.error || "Дождитесь загрузки программ.")
    if (!current.store.userId) return prepareEditorProjects(localStorage, projectId, navigator.locks)
    const raw = current.snapshot.raw || "[]"
    const original = JSON.parse(raw) as RobotProject[]
    const clean = parseProjects(original)
    const index = clean.findIndex(project => project.id === projectId)
    if (index < 0) return { projects: clean, raw }
    const migration = migrateControlWorkspace(original[index])
    if (!migration.changed) return { projects: clean, raw }
    const prefix = `${cacheKey(current.store.userId)}.migration:${projectId}`
    const prior = localStorage.getItem(prefix)
    const backup = prior !== null && prior !== raw ? `${prefix}:${crypto.randomUUID()}` : prefix
    localStorage.setItem(backup, raw)
    if (localStorage.getItem(backup) !== raw) throw new Error("Не удалось подтвердить резервную копию. Сохранение остановлено.")
    const next = original.slice()
    next[index] = migration.project
    await current.store.save("projects", next, original)
    return { projects: next.map(validateProject), raw: JSON.stringify(next) }
  }, [])

  const backupRaw = useCallback((): string | null => {
    const current = latest.current
    if (!current.store.userId) return localStorage.getItem(STORAGE_KEY)
    return current.ready ? current.snapshot.raw : localStorage.getItem(cacheKey(current.store.userId))
  }, [])

  const copyLocalPrograms = useCallback(async (): Promise<number> => {
    const current = latest.current
    if (!current.store.userId || !current.ready) throw new Error("Дождитесь загрузки аккаунта.")
    const source = localStorage.getItem(STORAGE_KEY)
    if (!source) return 0
    const local = loadProjects(localStorage)
    const plannedCopies = prepareLegacyProjectCopies(localStorage, current.store.userId, source, local)
    // A failed PUT may later succeed on reconnect. Reuse IDs and never overwrite an already adopted copy.
    const existing = new Set(current.snapshot.projects.map(project => project.id))
    const copies = plannedCopies.filter(project => !existing.has(project.id))
    await save([...current.snapshot.projects, ...copies], current.snapshot.raw)
    // Only a successful acknowledged cloud write marks these browser programs as copied.
    try { localStorage.setItem(importKey(current.store.userId), source) } catch {}
    setImportedRaw(source)
    return copies.length
  }, [save])

  const writeDraft = useCallback((projectId: string, projects: RobotProject[], baseRaw: string | null): EditorProjectDraft | null => {
    const current = latest.current
    if (!current.store.userId) return null
    // A duplicated browser tab may inherit sessionStorage; use a fresh editor instance ID.
    draftTabId.current ??= crypto.randomUUID()
    const draft = writeEditorProjectDraft(localStorage, current.store.userId, draftTabId.current, projectId, projects, baseRaw, crypto.randomUUID())
    window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
    return draft
  }, [])
  const clearDraft = useCallback((draft: EditorProjectDraft | null) => {
    if (!draft || draft.userId !== latest.current.store.userId) return
    clearEditorProjectDraft(localStorage, draft)
    window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
  }, [])
  const acknowledgeDraft = useCallback((draft: EditorProjectDraft | null, raw: string) => {
    if (!draft || draft.userId !== latest.current.store.userId) return
    acknowledgeEditorProjectDraft(localStorage, draft, raw)
    window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
  }, [])
  const restoreDraft = useCallback(async (draft: EditorProjectDraft) => {
    if (draft.userId !== latest.current.store.userId) throw new Error("Аккаунт изменился.")
    await save(draft.projects, draft.baseRaw)
    clearDraft(draft)
  }, [save, clearDraft])

  let localCount = 0
  try { localCount = parseProjects(JSON.parse(localRaw || "[]")).length } catch {}
  return {
    ...snapshot, error, ready, userId: store.userId, saving: store.saving,
    prepare, save, backupRaw, copyLocalPrograms, drafts, writeDraft, clearDraft, acknowledgeDraft, restoreDraft,
    localCount: store.userId && importedRaw !== localRaw ? localCount : 0,
    hasLocalBackup: localRaw !== null,
    downloadLocalRaw: () => localStorage.getItem(STORAGE_KEY),
  }
}
