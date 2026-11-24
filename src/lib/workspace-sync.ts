import type { WorkspaceSection, WorkspaceValues } from "./guest-workspace.ts"

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>
type Pending = { base: unknown; value: unknown }
type RecoveryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">
export type WorkspaceSnapshot = {
  values: WorkspaceValues; ready: boolean; saving: boolean; error: string; conflicts: WorkspaceSection[]
}
export const WORKSPACE_SECTIONS: WorkspaceSection[] = ["settings", "layout", "board", "projects"]
export const emptySection = (section: WorkspaceSection): unknown => section === "board" || section === "projects" ? [] : {}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]))
  return value
}
export const workspaceValuesEqual = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const same = workspaceValuesEqual
const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v))
const arraySection = (section: WorkspaceSection) => section === "board" || section === "projects"

/** Three-way merge at entity boundaries. A program/card is atomic: never mix its content silently. */
export function mergeWorkspaceSection(section: WorkspaceSection, base: unknown, local: unknown, remote: unknown): { value: unknown; conflict: boolean } {
  if (same(local, remote) || same(base, remote)) return { value: local, conflict: false }
  if (same(base, local)) return { value: remote, conflict: false }
  function keyed(value: unknown): Record<string, unknown> | null {
    if (!arraySection(section)) return record(value) ? value : null
    if (!Array.isArray(value)) return null
    const entries: Record<string, unknown> = Object.create(null)
    for (const item of value) {
      if (!record(item) || typeof item.id !== "string" || Object.hasOwn(entries, item.id)) return null
      entries[item.id] = item
    }
    return entries
  }
  const b = keyed(base), l = keyed(local), r = keyed(remote)
  if (!b || !l || !r) return { value: local, conflict: true }
  const merged: Record<string, unknown> = Object.create(null)
  for (const key of new Set([...Object.keys(r), ...Object.keys(l), ...Object.keys(b)])) {
    const unchangedLocal = same(b[key], l[key]), unchangedRemote = same(b[key], r[key])
    if (!unchangedLocal && !unchangedRemote && !same(l[key], r[key])) return { value: local, conflict: true }
    const chosen = unchangedLocal ? r[key] : l[key]
    if (chosen !== undefined) merged[key] = chosen
  }
  return { value: arraySection(section) ? Object.values(merged) : merged, conflict: false }
}

export function createWorkspaceSync(options: { userId: string; tabId: string; fetch: Fetcher; storage: RecoveryStorage }) {
  const { userId, tabId, storage } = options
  let snapshot: WorkspaceSnapshot = { values: {}, ready: false, saving: false, error: "", conflicts: [] }
  let confirmed: WorkspaceValues = {}, revisions: Partial<Record<WorkspaceSection, number>> = {}
  const pending = new Map<WorkspaceSection, Pending>()
  const recoverySources = new Map<string, string>()
  const listeners = new Set<() => void>()
  let disposed = false, recovered = false, requestRead = false, work: Promise<void> | null = null
  const controller = new AbortController()
  const prefix = `tlc-workspace-recovery:${userId}:`
  const keyFor = (section: WorkspaceSection) => `${prefix}${section}:${tabId}`
  const get = (values: WorkspaceValues, section: WorkspaceSection) => values[section] ?? emptySection(section)
  function publish(patch: Partial<WorkspaceSnapshot>) {
    if (disposed) return
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }
  function persist(section: WorkspaceSection) {
    const draft = pending.get(section)
    if (!draft) return
    // If this fails, refuse the edit rather than claiming an offline backup exists.
    const key = keyFor(section)
    const source = recoverySources.get(key)
    if (source && storage.getItem(key) === source) {
      storage.setItem(`tlc-workspace-archive:${userId}:${section}:${crypto.randomUUID()}`, source)
    }
    storage.setItem(key, JSON.stringify({ ...draft, revision: revisions[section] || 0, conflict: snapshot.conflicts.includes(section) }))
  }
  function clearRecovered(section: WorkspaceSection) {
    for (const [key, raw] of recoverySources) {
      if (key.startsWith(`${prefix}${section}:`)) {
        if (storage.getItem(key) === raw) storage.removeItem(key)
        recoverySources.delete(key)
      }
    }
  }
  function restore() {
    const conflicts = new Set(snapshot.conflicts)
    const values = { ...snapshot.values }
    // Adopt only legacy values explicitly scoped to the current account.
    for (const section of ["layout", "board"] as const) {
      if (confirmed[section] !== undefined) continue
      try {
        const raw = storage.getItem(`${section === "layout" ? "tlc-desktop-layout-v1" : "tlc-lab-board-v1"}:${userId}`)
        if (!raw) continue
        const value = JSON.parse(raw)
        if (!valid(section, value)) continue
        values[section] = value
        pending.set(section, { base: emptySection(section), value })
      } catch { /* Preserve legacy data in place if unreadable. */ }
    }
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(prefix)))
    for (const key of keys) {
      const section = key.slice(prefix.length).split(":")[0] as WorkspaceSection
      if (!WORKSPACE_SECTIONS.includes(section)) continue
      const raw = storage.getItem(key)
      if (!raw) continue
      try {
        const draft = JSON.parse(raw)
        if (!Number.isInteger(draft.revision) || !valid(section, draft.value)) continue
        const base = draft.base ?? (draft.revision === (revisions[section] || 0) ? get(confirmed, section) : undefined)
        recoverySources.set(key, raw)
        const result = base === undefined ? { value: draft.value, conflict: true }
          : mergeWorkspaceSection(section, base, draft.value, get(values, section))
        values[section] = result.value
        pending.set(section, { base: get(confirmed, section), value: result.value })
        if (result.conflict || draft.conflict === true) conflicts.add(section)
      } catch { /* Malformed browser records remain available for manual recovery. */ }
    }
    publish({ values, conflicts: [...conflicts] })
  }
  function valid(section: WorkspaceSection, value: unknown) {
    return arraySection(section) ? Array.isArray(value) : record(value)
  }
  async function read() {
    const response = await options.fetch("/api/workspace", { cache: "no-store", signal: controller.signal })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || "Не удалось загрузить рабочее место.")
    if (result.userId !== userId) throw new Error("Аккаунт изменился. Обновите страницу.")
    if (!Array.isArray(result.sections)) throw new Error("Неверный ответ облачного хранилища.")
    const remote: WorkspaceValues = {}, nextRevisions: typeof revisions = {}
    for (const row of result.sections) {
      if (!WORKSPACE_SECTIONS.includes(row.section)) continue
      if (!valid(row.section, row.value) || !Number.isInteger(row.revision) || row.revision < 1) throw new Error("Данные рабочего места повреждены.")
      remote[row.section as WorkspaceSection] = row.value
      nextRevisions[row.section as WorkspaceSection] = row.revision
    }
    if (disposed) return
    const values = { ...remote }, conflicts = new Set<WorkspaceSection>(snapshot.conflicts)
    for (const [section, draft] of pending) {
      const merged = mergeWorkspaceSection(section, draft.base, draft.value, get(remote, section))
      values[section] = merged.value
      if (merged.conflict) conflicts.add(section)
      else {
        draft.base = get(remote, section)
        draft.value = merged.value
      }
    }
    confirmed = remote
    revisions = nextRevisions
    publish({ values, ready: true, conflicts: [...conflicts] })
    if (!recovered) { recovered = true; restore() }
    for (const section of pending.keys()) persist(section)
  }
  function stage(section: WorkspaceSection, value: unknown, expected?: unknown) {
    if (!snapshot.ready) throw new Error("Дождитесь загрузки облачного рабочего места.")
    if (snapshot.conflicts.includes(section)) throw new Error("Сначала разрешите конфликт версий рабочего места.")
    if (!valid(section, value)) throw new Error("Неверные данные рабочего места.")
    const current = get(snapshot.values, section)
    const merged = mergeWorkspaceSection(section, expected ?? current, value, current)
    if (merged.conflict) throw new Error("Эта программа или карточка изменена на другом устройстве. Сохраните копию и откройте новую версию.")
    const previous = pending.get(section)
    pending.set(section, { base: get(confirmed, section), value: merged.value })
    try { persist(section) } catch {
      if (previous) pending.set(section, previous); else pending.delete(section)
      throw new Error("Не удалось сохранить резервную копию в браузере. Освободите место и повторите.")
    }
    publish({ values: { ...snapshot.values, [section]: merged.value } })
  }
  function synchronize(): Promise<void> {
    if (work) return work
    if (disposed) return Promise.reject(new Error("Аккаунт изменился."))
    publish({ saving: true })
    work = Promise.resolve().then(async () => {
      let retries = 0
      try {
        while (!disposed) {
          if (requestRead) { requestRead = false; await read() }
          if (snapshot.conflicts.length) throw new Error("Изменения одной программы или карточки пересеклись на устройствах. Локальная копия сохранена.")
          const first = pending.entries().next().value as [WorkspaceSection, Pending] | undefined
          if (!first) break
          const [section, flight] = first
          const response = await options.fetch("/api/workspace", {
            method: "PUT", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ userId, section, value: flight.value, revision: revisions[section] || 0 }),
          })
          const result = await response.json()
          if (disposed) throw new Error("Аккаунт изменился.")
          if (response.status === 409 && result.error?.code === "conflict") {
            if (++retries > 3) throw new Error("Рабочее место часто меняется на другом устройстве. Повторите синхронизацию.")
            requestRead = true
            continue
          }
          if (!response.ok) throw new Error(result.error?.message || "Не удалось сохранить рабочее место.")
          if (result.userId !== userId || !Number.isInteger(result.revision) || result.revision < 1) throw new Error("Не удалось подтвердить сохранение в аккаунте.")
          confirmed = { ...confirmed, [section]: flight.value }
          revisions[section] = result.revision
          if (pending.get(section) === flight) {
            pending.delete(section)
            storage.removeItem(keyFor(section))
            clearRecovered(section)
          } else {
            pending.get(section)!.base = flight.value
            persist(section)
          }
        }
        if (!disposed) publish({ error: "" })
      } catch (error) {
        if (!disposed) publish({ error: error instanceof Error ? error.message : "Ошибка синхронизации." })
        throw error
      } finally {
        work = null
        if (!disposed) publish({ saving: false })
      }
    })
    return work
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refresh() { requestRead = true; await synchronize() },
    update(section: WorkspaceSection, value: unknown, expected?: unknown) {
      try { stage(section, value, expected); void synchronize().catch(() => {}); return true }
      catch (error) { publish({ error: (error as Error).message }); return false }
    },
    async save(section: WorkspaceSection, value: unknown, expected?: unknown) {
      stage(section, value, expected)
      await synchronize()
      if (disposed) throw new Error("Аккаунт изменился.")
    },
    useCloud() {
      // Archive unsent work before accepting the cloud version; it stays in backup exports.
      for (const [key, raw] of recoverySources) {
        storage.setItem(`tlc-workspace-archive:${userId}:${key.slice(prefix.length).split(":")[0]}:${crypto.randomUUID()}`, raw)
      }
      for (const [section, draft] of pending) {
        storage.setItem(`tlc-workspace-archive:${userId}:${section}:${crypto.randomUUID()}`, JSON.stringify(draft))
        storage.removeItem(keyFor(section))
        clearRecovered(section)
      }
      pending.clear()
      publish({ values: { ...confirmed }, conflicts: [], error: "" })
      requestRead = true
      return synchronize()
    },
    backup() {
      const recovery: Record<string, unknown> = {}
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith(prefix) || key?.startsWith(`tlc-workspace-archive:${userId}:`) || key?.startsWith(`tlc-note-draft:${userId}:`) || key?.startsWith(`tlc-note-archive:${userId}:`)) {
          try { recovery[key!] = JSON.parse(storage.getItem(key!) || "null") } catch { /* Keep export usable. */ }
        }
      }
      return { userId, current: snapshot.values, recovery, sources: Object.fromEntries(recoverySources) }
    },
    dispose() { disposed = true; controller.abort(); listeners.clear() },
  }
}
