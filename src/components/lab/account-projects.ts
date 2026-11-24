"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAccountWorkspace } from "./account-workspace"
import { STORAGE_KEY, loadProjects, prepareEditorProjects, saveEditorProjects, type RobotProject } from "@/lib/projects"
import { migrateControlWorkspace } from "@/lib/control-workspace"
import {
  preserveStoredProject, cacheAccountProjects, cachedAccountProjects, prepareLegacyProjectCopies,
  createEditorProjectDraft, editorProjectDraftPrefix, parseEditorProjectDraft, readEditorProjectDrafts,
  acknowledgeEditorProjectDraft, clearEditorProjectDraft, legacyProjectFingerprint, type EditorProjectDraft,
} from "@/lib/account-projects"
import { createBrowserProjectJournal, type ProjectJournal } from "@/lib/project-journal"

const LOCAL_PROJECTS_CHANGED = "tlc-local-projects-changed"
const cacheKey = (userId: string) => `tlc-account-projects-backup:${userId}`
const importKey = (userId: string) => `tlc-account-projects-imported:${userId}`

function parseProjects(value: unknown): RobotProject[] {
  if (!Array.isArray(value)) throw new Error("Список программ повреждён. Скачайте резервную копию.")
  return value.map(preserveStoredProject)
}
function draftStorage(key: string, raw: string | null) {
  const values = new Map<string, string>(raw === null ? [] : [[key, raw]])
  return {
    getItem: (id: string) => values.get(id) ?? null,
    setItem: (id: string, value: string) => { values.set(id, value) },
    removeItem: (id: string) => { values.delete(id) },
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size },
  }
}

/** Cloud records and durable IndexedDB drafts are scoped to the active account. */
export function useAccountProjects() {
  const store = useAccountWorkspace()
  const [localRaw, setLocalRaw] = useState<string | null>(null)
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null)
  const [localError, setLocalError] = useState("")
  const [journalError, setJournalError] = useState("")
  const [importedRaw, setImportedRaw] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<EditorProjectDraft[]>([])
  const draftTabId = useRef<string | null>(null)
  const journal = useRef<ProjectJournal | null>(null)
  const fingerprint = useRef<{ raw: string; value: string } | null>(null)
  const getJournal = useCallback(() => { journal.current ??= createBrowserProjectJournal(); return journal.current }, [])

  useEffect(() => {
    let active = true, generation = 0
    setDrafts([]); setJournalError("")
    async function readLocal() {
      const epoch = ++generation
      let legacy: EditorProjectDraft[] = []
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!active || epoch !== generation) return
        setLocalRaw(raw)
        setImportedRaw(store.userId ? localStorage.getItem(importKey(store.userId)) : null)
        legacy = store.userId ? readEditorProjectDrafts(localStorage, store.userId) : []
        setLocalError("")
        if (store.userId && raw !== null) {
          const digest = fingerprint.current?.raw === raw ? fingerprint.current.value : await legacyProjectFingerprint(raw)
          if (!active || epoch !== generation) return
          fingerprint.current = { raw, value: digest }
          setLocalFingerprint(digest)
        } else setLocalFingerprint(null)
      } catch {
        if (active && epoch === generation) setLocalError("Не удалось прочитать программы этого браузера.")
      }
      if (!active || epoch !== generation) return
      if (!store.userId) { setDrafts([]); setJournalError(""); return }
      try {
        const rows = await getJournal().entries(editorProjectDraftPrefix(store.userId, 2))
        if (!active || epoch !== generation) return
        const current = rows.map(([key, raw]) => parseEditorProjectDraft(key, raw, store.userId!)).filter((value): value is EditorProjectDraft => value !== null)
        setDrafts([...legacy, ...current].sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
        setJournalError("")
      } catch (error) {
        if (active && epoch === generation) {
          setDrafts(legacy)
          setJournalError(error instanceof Error ? error.message : "Не удалось открыть резервные копии программ.")
        }
      }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY || event.key === null || event.key === (store.userId && importKey(store.userId)) || Boolean(store.userId && event.key?.startsWith(editorProjectDraftPrefix(store.userId, 1)))) void readLocal()
    }
    const refresh = () => { void readLocal() }
    const onVisible = () => { if (document.visibilityState === "visible") refresh() }
    refresh()
    window.addEventListener("storage", onStorage)
    window.addEventListener(LOCAL_PROJECTS_CHANGED, refresh)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      active = false; generation++
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(LOCAL_PROJECTS_CHANGED, refresh)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [store.userId, getJournal])

  const snapshot = useMemo(() => {
    try {
      const value = store.userId ? store.values.projects ?? [] : JSON.parse(localRaw || "[]")
      return { projects: parseProjects(value), raw: store.userId ? JSON.stringify(value) : localRaw, error: "" }
    } catch (error) {
      return { projects: [] as RobotProject[], raw: store.userId ? JSON.stringify(store.values.projects ?? []) : localRaw,
        error: error instanceof Error ? error.message : "Не удалось прочитать программы." }
    }
  }, [store.userId, store.values.projects, localRaw])
  const error = store.error || snapshot.error || (store.userId ? journalError : localError)
  const ready = store.ready && !snapshot.error && (Boolean(store.userId) || !localError)
  const latest = useRef({ store, snapshot, ready, error, localRaw })
  latest.current = { store, snapshot, ready, error, localRaw }

  useEffect(() => {
    if (store.userId && ready) {
      try { cacheAccountProjects(localStorage, store.userId, snapshot.projects) } catch {}
    }
  }, [store.userId, ready, snapshot.raw])

  const save = useCallback(async (projects: RobotProject[], expectedRaw: string | null): Promise<string> => {
    const current = latest.current
    if (!current.ready) throw new Error(current.error || "Дождитесь загрузки программ.")
    const clean = projects.map(preserveStoredProject)
    if (!current.store.userId) {
      const raw = await saveEditorProjects(localStorage, clean, expectedRaw, navigator.locks)
      setLocalRaw(raw)
      window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
      return raw
    }
    const expected = JSON.parse(expectedRaw || "[]")
    parseProjects(expected)
    await current.store.save("projects", clean, expected)
    return JSON.stringify(clean)
  }, [])

  const prepare = useCallback(async (projectId: string): Promise<{ projects: RobotProject[]; raw: string | null; readOnly?: boolean }> => {
    const current = latest.current
    if (!current.ready) throw new Error(current.error || "Дождитесь загрузки программ.")
    if (!current.store.userId) return prepareEditorProjects(localStorage, projectId, navigator.locks)
    const raw = current.snapshot.raw || "[]", original = JSON.parse(raw) as RobotProject[], clean = parseProjects(original)
    const index = clean.findIndex(project => project.id === projectId)
    if (index < 0) return { projects: clean, raw }
    const migration = migrateControlWorkspace(original[index])
    if (!migration.changed) return { projects: clean, raw }
    const prefix = `tlc-project-migration:v2:${current.store.userId}:${encodeURIComponent(projectId)}`
    const migrationBackup = JSON.stringify([original[index]])
    const prior = await getJournal().get(prefix)
    const backup = prior !== null && prior !== migrationBackup ? `${prefix}:${crypto.randomUUID()}` : prefix
    await getJournal().set(backup, migrationBackup)
    const next = original.slice(); next[index] = migration.project
    await current.store.save("projects", next, original)
    return { projects: next.map(preserveStoredProject), raw: JSON.stringify(next) }
  }, [getJournal])

  const backupRaw = useCallback((): string | null => {
    const current = latest.current
    if (!current.store.userId) return localStorage.getItem(STORAGE_KEY)
    if (current.ready) return current.snapshot.raw
    const cached = cachedAccountProjects(localStorage, current.store.userId)
    return cached.length ? JSON.stringify(cached) : localStorage.getItem(cacheKey(current.store.userId))
  }, [])

  const copyLocalPrograms = useCallback(async (): Promise<number> => {
    const current = latest.current
    if (!current.store.userId || !current.ready) throw new Error("Дождитесь загрузки аккаунта.")
    const source = localStorage.getItem(STORAGE_KEY)
    if (!source) return 0
    const local = loadProjects(localStorage)
    const plannedCopies = await prepareLegacyProjectCopies(localStorage, current.store.userId, source, local)
    const existing = new Set(current.snapshot.projects.map(project => project.id))
    const copies = plannedCopies.filter(project => !existing.has(project.id))
    if (latest.current.store.userId !== current.store.userId) throw new Error("Аккаунт изменился.")
    await save([...current.snapshot.projects, ...copies], current.snapshot.raw)
    const digest = await legacyProjectFingerprint(source), marker = `sha256:${digest}`
    try { localStorage.setItem(importKey(current.store.userId), marker) } catch {}
    setLocalFingerprint(digest); setImportedRaw(marker)
    return copies.length
  }, [save])

  const writeDraft = useCallback(async (projectId: string, projects: RobotProject[], baseRaw: string | null): Promise<EditorProjectDraft | null> => {
    const current = latest.current
    if (!current.store.userId) return null
    draftTabId.current ??= crypto.randomUUID()
    const draft = createEditorProjectDraft(current.store.userId, draftTabId.current, projectId, projects, baseRaw, crypto.randomUUID(), 2)
    await getJournal().set(draft.key, JSON.stringify(draft))
    window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
    return draft
  }, [getJournal])
  const clearDraft = useCallback(async (draft: EditorProjectDraft | null): Promise<void> => {
    if (!draft || draft.userId !== latest.current.store.userId) return
    if (draft.key.startsWith(editorProjectDraftPrefix(draft.userId, 2))) {
      await getJournal().mutate(draft.key, raw => {
        if (!raw) return null
        const current = parseEditorProjectDraft(draft.key, raw, draft.userId)
        return current?.token === draft.token ? null : raw
      })
    } else if (draft.key.startsWith(editorProjectDraftPrefix(draft.userId, 1))) clearEditorProjectDraft(localStorage, draft)
    window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
  }, [getJournal])
  const acknowledgeDraft = useCallback(async (draft: EditorProjectDraft | null, raw: string): Promise<void> => {
    if (!draft || draft.userId !== latest.current.store.userId) return
    if (draft.key.startsWith(editorProjectDraftPrefix(draft.userId, 2))) {
      await getJournal().mutate(draft.key, stored => {
        if (!stored || !parseEditorProjectDraft(draft.key, stored, draft.userId)) return stored
        const adapter = draftStorage(draft.key, stored)
        acknowledgeEditorProjectDraft(adapter, draft, raw)
        return adapter.getItem(draft.key)
      })
    } else if (draft.key.startsWith(editorProjectDraftPrefix(draft.userId, 1))) clearEditorProjectDraft(localStorage, draft)
    window.dispatchEvent(new Event(LOCAL_PROJECTS_CHANGED))
  }, [getJournal])
  const restoreDraft = useCallback(async (draft: EditorProjectDraft) => {
    if (draft.userId !== latest.current.store.userId) throw new Error("Аккаунт изменился.")
    await save(draft.projects, draft.baseRaw)
    await clearDraft(draft)
  }, [save, clearDraft])

  let localCount = 0
  try { localCount = parseProjects(JSON.parse(localRaw || "[]")).length } catch {}
  const imported = importedRaw === localRaw || Boolean(localFingerprint && importedRaw === `sha256:${localFingerprint}`)
  return {
    ...snapshot, error, ready, userId: store.userId, saving: store.saving,
    prepare, save, backupRaw, copyLocalPrograms, drafts: drafts.filter(draft => draft.userId === store.userId), writeDraft, clearDraft, acknowledgeDraft, restoreDraft,
    localCount: store.userId && !imported ? localCount : 0,
    hasLocalBackup: localRaw !== null,
    downloadLocalRaw: () => localStorage.getItem(STORAGE_KEY),
  }
}
