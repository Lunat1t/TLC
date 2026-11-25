import { validateProject, type RobotProject } from "./projects.ts"
import type { ProjectJournal } from "./project-journal.ts"
import { workspaceValuesEqual as equal } from "./workspace-sync.ts"

type LocalStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">
type RecordValue = { id: string; value: RobotProject | null; revision: number }
type Draft = { base: RobotProject | null; value: RobotProject | null; conflict?: boolean }
export type ProjectSyncSnapshot = { projects: RobotProject[]; ready: boolean; saving: boolean; error: string; conflicts: string[] }
export function createProjectSync(options: { userId: string; instanceId: string; storage: LocalStorage; fetch: typeof fetch; journal?: ProjectJournal; deferPush?: boolean }) {
  const { userId, instanceId, storage, deferPush = false } = options
  // deferPush: edits stay in the browser until flush() (sign-out) sends them to the cloud.
  let flushing = false
  const journal: ProjectJournal = options.journal ?? {
    async get(key) { return storage.getItem(key) }, async set(key, value) { storage.setItem(key, value) },
    async remove(key) { storage.removeItem(key) },
    async entries(prefix) { return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(prefix))).map(key => [key, storage.getItem(key)!]) },
    async mutate(key, transform) { const next = transform(storage.getItem(key)); if (next === null) storage.removeItem(key); else storage.setItem(key, next) },
  }
  let snapshot: ProjectSyncSnapshot = { projects: [], ready: false, saving: false, error: "", conflicts: [] }
  let confirmed = new Map<string, RecordValue>()
  const pending = new Map<string, Draft>(), listeners = new Set<() => void>()
  const sources = new Map<string, { raw: string; ids: Set<string>; local: boolean }>()
  const archives = new Map<string, string>()
  const persistence = new Map<string, { draft: Draft; promise: Promise<void> }>()
  const prefix = `tlc-project-recovery:v2:${userId}:`
  let work: Promise<void> | null = null, requestRead = false, restored = false, disposed = false
  const controller = new AbortController()
  const keyFor = (id: string) => `${prefix}${encodeURIComponent(id)}:${instanceId}`
  const projectMap = (projects: unknown): Map<string, RobotProject> => {
    if (!Array.isArray(projects)) throw Error("Список программ повреждён.")
    const result = new Map<string, RobotProject>()
    for (const value of projects) {
      const clean = validateProject(value)
      if ((clean.hub !== "spike" && clean.hub !== "ev3") || result.has(clean.id)) throw Error("Список программ повреждён.")
      result.set(clean.id, value as RobotProject)
    }
    return result
  }
  function publish(patch: Partial<ProjectSyncSnapshot> = {}) {
    if (disposed) return
    const values = new Map([...confirmed].filter(([, row]) => row.value).map(([id, row]) => [id, row.value!]))
    for (const [id, draft] of pending) { if (draft.value) values.set(id, draft.value); else values.delete(id) }
    const next = [...values.values()]
    const projects = next.length === snapshot.projects.length && next.every((project, i) => project === snapshot.projects[i]) ? snapshot.projects : next
    snapshot = { ...snapshot, ...patch, projects }
    for (const listener of listeners) listener()
  }
  async function archive(raw: string) {
    const key = `tlc-project-archive:v2:${userId}:${crypto.randomUUID()}`
    await journal.set(key, raw); archives.set(key, raw)
  }
  function persist(id: string) {
    const draft = pending.get(id)
    if (!draft) return Promise.resolve()
    const key = keyFor(id), original = sources.get(key)
    const raw = JSON.stringify({ id, ...draft, revision: confirmed.get(id)?.revision || 0 })
    const previous = persistence.get(id)?.promise ?? Promise.resolve()
    const promise = previous.catch(() => {}).then(async () => {
      if (!deferPush && original && await journal.get(key) === original.raw) await archive(original.raw)
      await journal.set(key, raw)
    })
    // Start durability immediately but handle failures in synchronize before any PUT.
    void promise.catch(() => {})
    persistence.set(id, { draft, promise })
    return promise
  }
  async function consumeSources(id: string) {
    for (const [key, source] of sources) {
      source.ids.delete(id)
      if (!source.ids.size) {
        if (source.local) { if (storage.getItem(key) === source.raw) storage.removeItem(key) }
        else await journal.mutate(key, current => current === source.raw ? null : current)
        sources.delete(key)
      }
    }
  }
  function merge(base: RobotProject | null, local: RobotProject | null, remote: RobotProject | null) {
    if (equal(base, remote) || equal(local, remote)) return { value: local, conflict: false }
    if (equal(base, local)) return { value: remote, conflict: false }
    return { value: local, conflict: true }
  }
  async function recover() {
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((key): key is string => Boolean(key?.startsWith(prefix) || key?.startsWith(`tlc-workspace-recovery:${userId}:projects:`)))
    const records = new Map((await journal.entries(prefix)).map(([key, raw]) => [key, { raw, local: false }]))
    for (const key of keys) { const raw = storage.getItem(key); if (raw && !records.has(key)) records.set(key, { raw, local: true }) }
    for (const [key, raw] of await journal.entries(`tlc-project-archive:v2:${userId}:`)) archives.set(key, raw)
    for (const [key, source] of records) {
      const { raw } = source
      try {
        const saved = JSON.parse(raw)
        const drafts = new Map<string, Draft>()
        if (key.startsWith(prefix)) {
          if (typeof saved.id !== "string" || !Object.hasOwn(saved, "base") || !Object.hasOwn(saved, "value")) continue
          if (saved.base !== null && validateProject(saved.base).id !== saved.id) continue
          if (saved.value !== null && validateProject(saved.value).id !== saved.id) continue
          drafts.set(saved.id, saved)
        } else {
          // Legacy section drafts carry a full base; convert just their changed programs.
          const base = projectMap(saved.base), next = projectMap(saved.value)
          for (const id of new Set([...base.keys(), ...next.keys()])) {
            const b = base.get(id) ?? null, value = next.get(id) ?? null
            if (!equal(b, value)) drafts.set(id, { base: b, value, conflict: saved.conflict === true })
          }
        }
        sources.set(key, { raw, ids: new Set(drafts.keys()), local: source.local })
        for (const [id, draft] of drafts) {
          const current = pending.has(id) ? pending.get(id)!.value : confirmed.get(id)?.value ?? null
          const result = merge(draft.base, draft.value, current)
          const tombstone = draft.base === null && draft.value !== null && confirmed.get(id)?.value === null
          const conflict = tombstone || result.conflict || draft.conflict === true || pending.get(id)?.conflict === true
          pending.set(id, { base: conflict ? draft.base : confirmed.get(id)?.value ?? null, value: result.value, conflict })
        }
      } catch { /* Original browser records remain available for manual recovery. */ }
    }
    publish({ conflicts: [...pending].filter(([, draft]) => draft.conflict).map(([id]) => id) })
  }
  async function json(path: string, init: RequestInit = {}) {
    const response = await options.fetch(path, { ...init, cache: "no-store", signal: controller.signal })
    const result = await response.json()
    if (!response.ok) {
      const error = new Error(result.error?.message || "Не удалось синхронизировать программы.") as Error & { conflict?: boolean }
      error.conflict = response.status === 409 && result.error?.code === "conflict"
      throw error
    }
    if (result.userId !== userId) throw Error("Аккаунт изменился. Обновите страницу.")
    return result
  }
  function validateRecord(row: RecordValue) {
    if (typeof row.id !== "string" || !Number.isSafeInteger(row.revision) || row.revision < 1 || (row.value !== null && validateProject(row.value).id !== row.id)) throw Error("Неверный ответ облачного хранилища программ.")
    return row
  }
  async function read() {
    const metadata = new Map<string, { id: string; revision: number; deleted: boolean }>()
    let cursor: string | null = null
    do {
      const result = await json(`/api/projects${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`)
      if (!Array.isArray(result.projects)) throw Error("Неверный список облачных программ.")
      for (const row of result.projects) {
        if (typeof row.id !== "string" || !Number.isSafeInteger(row.revision) || row.revision < 1 || typeof row.deleted !== "boolean" || metadata.has(row.id)) throw Error("Неверный список облачных программ.")
        metadata.set(row.id, row)
      }
      const next = result.nextCursor
      if (next !== null && (typeof next !== "string" || !next || next === cursor || !metadata.has(next) || next !== result.projects.at(-1)?.id)) throw Error("Неверная страница облачных программ.")
      cursor = next
    } while (cursor !== null)
    const remote = new Map<string, RecordValue>(), changed = []
    for (const row of metadata.values()) {
      const old = confirmed.get(row.id)
      if (old?.revision === row.revision) remote.set(row.id, old)
      else if (row.deleted) remote.set(row.id, { id: row.id, value: null, revision: row.revision })
      else changed.push(row)
    }
    // Metadata is small; full programs are fetched individually and only when changed.
    for (let index = 0; index < changed.length; index += 4) {
      const records = await Promise.all(changed.slice(index, index + 4).map(async row => {
        const record = validateRecord(await json(`/api/projects/${encodeURIComponent(row.id)}`))
        if (record.id !== row.id || record.revision < row.revision) throw Error("Программа изменилась во время загрузки. Повторите синхронизацию.")
        return record
      }))
      for (const record of records) remote.set(record.id, record)
    }
    if (disposed) return
    for (const [id, draft] of pending) {
      const current = remote.get(id)?.value ?? null, result = merge(draft.base, draft.value, current)
      if (result.conflict || (draft.base === null && draft.value !== null && remote.get(id)?.value === null)) draft.conflict = true
      else if (!draft.conflict) { draft.base = current; draft.value = result.value }
    }
    confirmed = remote
    if (!restored) { await recover(); restored = true }
    if (disposed) return
    publish({ ready: true })
    publish({ conflicts: [...pending].filter(([, draft]) => draft.conflict).map(([id]) => id) })
    for (const id of pending.keys()) await persist(id)
  }
  function forget(id: string) {
    pending.delete(id)
    const previous = persistence.get(id)?.promise ?? Promise.resolve()
    const promise = previous.catch(() => {}).then(async () => { await journal.remove(keyFor(id)); await consumeSources(id) })
    void promise.catch(() => {})
    persistence.set(id, { draft: { base: null, value: null }, promise })
  }
  function stage(projects: RobotProject[], expected?: RobotProject[]) {
    if (!snapshot.ready) throw Error("Дождитесь загрузки программ.")
    const current = projectMap(snapshot.projects), base = projectMap(expected ?? snapshot.projects), next = projectMap(projects)
    const updates = new Map<string, Draft>()
    for (const id of new Set([...base.keys(), ...next.keys()])) {
      const before = base.get(id) ?? null, value = next.get(id) ?? null
      if (equal(before, value)) continue
      if (pending.get(id)?.conflict) throw Error("Сначала разрешите конфликт этой программы.")
      if (!before && value && confirmed.get(id)?.value === null) throw Error("Программа была удалена. Импортируйте её как новую копию.")
      const result = merge(before, value, current.get(id) ?? null)
      if (result.conflict) throw Error("Эта программа изменена на другом устройстве. Сохраните копию и откройте новую версию.")
      updates.set(id, { base: confirmed.get(id)?.value ?? null, value: result.value })
    }
    // Queue each program's durability separately; cloud writes wait for its journal transaction.
    for (const [id, draft] of updates) {
      // Created and deleted before it ever reached the cloud: there is nothing to send.
      if (deferPush && draft.value === null && !confirmed.has(id)) { forget(id); continue }
      pending.set(id, draft); void persist(id)
    }
    publish()
  }
  function synchronize(): Promise<void> {
    if (work) return work
    if (disposed) return Promise.reject(Error("Аккаунт изменился."))
    publish({ saving: true })
    work = Promise.resolve().then(async () => {
      let retries = 0
      try {
        while (!disposed) {
          if (requestRead) { requestRead = false; await read() }
          if (snapshot.conflicts.length) throw Error("Программа изменена на двух устройствах. Локальная копия сохранена.")
          const first = pending.entries().next().value as [string, Draft] | undefined
          if (!first || (deferPush && !flushing)) break
          const [id, flight] = first
          const durability = persistence.get(id)
          if (durability?.draft === flight) await durability.promise
          else await persist(id)
          if (pending.get(id) !== flight) continue
          let result: RecordValue
          const expectedRevision = confirmed.get(id)?.revision || 0
          try {
            result = validateRecord(await json(`/api/projects/${encodeURIComponent(id)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, value: flight.value, revision: expectedRevision }) }))
          } catch (error) {
            if ((error as Error & { conflict?: boolean }).conflict && ++retries <= 3) { requestRead = true; continue }
            throw error
          }
          if (disposed) throw Error("Аккаунт изменился.")
          if (result.id !== id || result.revision <= expectedRevision || !equal(result.value, flight.value)) throw Error("Облако не подтвердило сохранение программы.")
          confirmed.set(id, result)
          if (pending.get(id) === flight) {
            pending.delete(id); await journal.remove(keyFor(id)); await consumeSources(id)
          } else { pending.get(id)!.base = result.value; await persist(id) }
          publish()
        }
        if (!disposed) publish({ error: "" })
      } catch (error) {
        if (!disposed) publish({ error: error instanceof Error ? error.message : "Ошибка сохранения программ." })
        throw error
      } finally { work = null; if (!disposed) publish({ saving: false }) }
    })
    return work
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async refresh() { requestRead = true; await synchronize() },
    async flush() {
      flushing = true
      try {
        if (deferPush && !disposed) { requestRead = true; await (work ?? synchronize()) }
        while (!disposed && (work || pending.size > 0)) {
          await (work ?? synchronize())
        }
      } finally { flushing = false }
    },
    update(projects: RobotProject[], expected?: RobotProject[]) {
      try { stage(projects, expected); if (!deferPush) void synchronize().catch(() => {}); return true }
      catch (error) { publish({ error: error instanceof Error ? error.message : "Не удалось сохранить программу." }); return false }
    },
    async save(projects: RobotProject[], expected?: RobotProject[]) {
      stage(projects, expected)
      // Deferred saves are done once the browser journal holds them.
      if (deferPush) await Promise.all([...persistence.values()].map(entry => entry.promise))
      else await synchronize()
      if (disposed) throw Error("Аккаунт изменился.")
    },
    async useCloud() {
      for (const source of sources.values()) await archive(source.raw)
      for (const [id, draft] of pending) {
        await archive(JSON.stringify({ id, ...draft }))
        await journal.remove(keyFor(id)); await consumeSources(id)
      }
      pending.clear(); publish({ conflicts: [], error: "" }); requestRead = true; await synchronize()
    },
    backup() {
      const recovery: Record<string, string | null> = {}
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (key?.startsWith(prefix) || key?.startsWith(`tlc-project-archive:v2:${userId}:`)) recovery[key] = storage.getItem(key)
      }
      return { userId, projects: snapshot.projects, recovery, pending: Object.fromEntries(pending), archives: Object.fromEntries(archives), sources: Object.fromEntries([...sources].map(([key, source]) => [key, source.raw])) }
    },
    dispose() { disposed = true; controller.abort(); listeners.clear() },
  }
}
