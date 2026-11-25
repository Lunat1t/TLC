"use client"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useAccess } from "@/components/auth/access-provider"
import { readGuestWorkspaceValues, writeGuestWorkspaceSection, type WorkspaceSection, type WorkspaceValues } from "@/lib/guest-workspace"
import { createWorkspaceSync } from "@/lib/workspace-sync"
import { createProjectSync, type ProjectSyncSnapshot } from "@/lib/project-sync"
import type { RobotProject } from "@/lib/projects"
import { createBrowserProjectJournal } from "@/lib/project-journal"

export type WorkspaceFlushResult = {
  ok: boolean
  reason?: "timeout" | "error" | "conflict"
  message?: string
}
type Store = {
  userId: string | null
  values: WorkspaceValues
  ready: boolean
  error: string
  saving: boolean
  update: (section: WorkspaceSection, value: unknown, expectedValue?: unknown) => boolean
  save: (section: WorkspaceSection, value: unknown, expectedValue?: unknown) => Promise<void>
  refresh: () => Promise<void>
  flush: (timeoutMs?: number) => Promise<WorkspaceFlushResult>
}
const Context = createContext<Store>({ userId: null, values: {}, ready: false, error: "", saving: false, update: () => false, save: async () => { throw Error("Рабочее место не загружено.") }, refresh: async () => {}, flush: async () => ({ ok: true }) })
export const useAccountWorkspace = () => useContext(Context)

export function AccountWorkspaceProvider({ children }: { children: ReactNode }) {
  const { userId, ready } = useAccess()
  return <AccountWorkspaceSession key={userId || "guest"} userId={userId} accessReady={ready}>{children}</AccountWorkspaceSession>
}

function AccountWorkspaceSession({ userId, accessReady, children }: { userId: string | null; accessReady: boolean; children: ReactNode }) {
  const [state, setState] = useState({ values: {} as WorkspaceValues, ready: false, error: "", saving: false, conflicts: [] as WorkspaceSection[] })
  const [programs, setPrograms] = useState<ProjectSyncSnapshot>({ projects: [], ready: false, saving: false, error: "", conflicts: [] })
  const [mediaError, setMediaError] = useState("")
  const [initialMediaReady, setInitialMediaReady] = useState(false)
  const engine = useRef<ReturnType<typeof createWorkspaceSync> | null>(null)
  const projects = useRef<ReturnType<typeof createProjectSync> | null>(null)
  const refreshSession = useRef<() => Promise<void>>(async () => {})
  const guest = useRef<WorkspaceValues>({})
  const guestReady = useRef(false)

  useEffect(() => {
    if (!accessReady) return
    if (!userId) {
      guest.current = readGuestWorkspaceValues(localStorage)
      guestReady.current = true
      setState({ values: guest.current, ready: true, error: "", saving: false, conflicts: [] })
      return () => { guestReady.current = false }
    }
    // One recovery slot per browser: unsent changes survive reloads until sign-out sends them.
    const tabId = "device", controller = new AbortController()
    const sync = createWorkspaceSync({ userId, tabId, fetch: window.fetch.bind(window), storage: localStorage, sections: ["settings", "layout", "board"], deferPush: true })
    const programSync = createProjectSync({ userId, instanceId: tabId, fetch: window.fetch.bind(window), storage: localStorage, journal: createBrowserProjectJournal(), deferPush: true })
    engine.current = sync
    projects.current = programSync
    const unsubscribe = sync.subscribe(() => setState(sync.getSnapshot()))
    const unsubscribePrograms = programSync.subscribe(() => setPrograms(programSync.getSnapshot()))
    let migrating = false
    async function migrateImages() {
      const current = sync.getSnapshot()
      if (controller.signal.aborted || migrating || !current.ready || current.conflicts.length || current.saving) return
      if (!JSON.stringify({ settings: current.values.settings, board: current.values.board }).includes("data:image/")) { setMediaError(""); return }
      migrating = true
      try {
        const response = await fetch("/api/workspace-media/migrate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }), signal: controller.signal })
        const result = await response.json()
        if (controller.signal.aborted) return
        if (!response.ok || result.userId !== userId) throw Error("Не удалось перенести старые картинки. Исходные изображения сохранены; повторим при синхронизации.")
        if (result.migrated > 0) await sync.refresh()
        setMediaError(result.failed > 0 ? "Некоторые картинки пока остаются в прежнем хранилище. Повторите синхронизацию." : "")
      } catch (error) { if (!controller.signal.aborted) setMediaError(error instanceof Error ? error.message : "Не удалось перенести изображения.") }
      finally { migrating = false }
    }
    const refresh = async () => {
      await Promise.allSettled([sync.refresh(), programSync.refresh()])
      await migrateImages()
      if (!controller.signal.aborted) setInitialMediaReady(true)
    }
    refreshSession.current = refresh
    const runRefresh = () => { void refresh() }
    const visibleRefresh = () => { if (document.visibilityState === "visible") runRefresh() }
    runRefresh()
    window.addEventListener("focus", runRefresh)
    window.addEventListener("online", runRefresh)
    document.addEventListener("visibilitychange", visibleRefresh)
    const timer = window.setInterval(visibleRefresh, 10_000)
    return () => {
      controller.abort()
      window.clearInterval(timer)
      window.removeEventListener("focus", runRefresh)
      window.removeEventListener("online", runRefresh)
      document.removeEventListener("visibilitychange", visibleRefresh)
      unsubscribe(); unsubscribePrograms()
      sync.dispose(); programSync.dispose()
      if (engine.current === sync) { engine.current = null; projects.current = null; refreshSession.current = async () => {} }
    }
  }, [userId, accessReady])

  const update = useCallback((section: WorkspaceSection, value: unknown, expected?: unknown) => {
    if (userId) return section === "projects"
      ? projects.current?.update(value as RobotProject[], expected as RobotProject[] | undefined) ?? false
      : engine.current?.update(section, value, expected) ?? false
    if (!guestReady.current) return false
    if (!writeGuestWorkspaceSection(localStorage, section, value)) { setState(old => ({ ...old, error: "Не удалось сохранить изменения в браузере." })); return false }
    guest.current = { ...guest.current, [section]: value }
    setState(old => ({ ...old, values: guest.current, error: "" }))
    return true
  }, [userId])
  const save = useCallback(async (section: WorkspaceSection, value: unknown, expected?: unknown) => {
    if (!userId) { if (!update(section, value)) throw Error("Не удалось сохранить изменения в браузере."); return }
    if (section === "projects") {
      if (!projects.current) throw Error("Дождитесь загрузки программ.")
      await projects.current.save(value as RobotProject[], expected as RobotProject[] | undefined)
    } else {
      if (!engine.current) throw Error("Дождитесь загрузки рабочего места.")
      await engine.current.save(section, value, expected)
    }
  }, [userId, update])
  const refresh = useCallback(async () => { await refreshSession.current() }, [])
  const flush = useCallback(async (timeoutMs = 5000): Promise<WorkspaceFlushResult> => {
    if (!userId) return { ok: true }
    const sync = engine.current
    const prog = projects.current
    if (!sync && !prog) return { ok: true }
    if (sync?.getSnapshot().conflicts.length || prog?.getSnapshot().conflicts.length) {
      return { ok: false, reason: "conflict", message: "Есть несохранённые конфликты версий." }
    }
    let timer: number | undefined
    try {
      const tasks: Promise<void>[] = []
      if (sync) tasks.push(sync.flush())
      if (prog) tasks.push(prog.flush())
      const outcome = await Promise.race([
        Promise.all(tasks).then(() => "ok" as const),
        new Promise<"timeout">(resolve => {
          timer = window.setTimeout(() => resolve("timeout"), timeoutMs)
        }),
      ])
      if (outcome === "timeout") {
        return { ok: false, reason: "timeout", message: "Не удалось дождаться отправки всех изменений в облако (превышено время ожидания)." }
      }
      return { ok: true }
    } catch (error) {
      const hasConflict = Boolean(sync?.getSnapshot().conflicts.length || prog?.getSnapshot().conflicts.length)
      return {
        ok: false,
        reason: hasConflict ? "conflict" : "error",
        message: error instanceof Error ? error.message : "Не удалось сохранить изменения в облако.",
      }
    } finally {
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [userId])
  function downloadRecovery() {
    const data = { workspace: engine.current?.backup() ?? { current: state.values }, programs: projects.current?.backup() }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a"); link.href = url; link.download = "tlc-workspace-backup.json"; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function useCloud() {
    const tasks: Promise<void>[] = []
    if (state.conflicts.length && engine.current) tasks.push(engine.current.useCloud())
    if (programs.conflicts.length && projects.current) tasks.push(projects.current.useCloud())
    await Promise.allSettled(tasks)
  }
  const error = state.error || (userId ? programs.error || mediaError : "")
  return <Context.Provider value={{ userId, values: userId ? { ...state.values, projects: programs.projects } : state.values, ready: accessReady && state.ready && (!userId || (programs.ready && initialMediaReady)), error, saving: state.saving || (Boolean(userId) && programs.saving), update, save, refresh, flush }}>
    {children}
    {userId && (state.conflicts.length > 0 || programs.conflicts.length > 0) && <div className="workspace-sync-status" role="alert">
      {error}<button onClick={downloadRecovery}>Скачать копию</button>
      <button onClick={() => { void useCloud() }}>Открыть облачную версию</button>
    </div>}
  </Context.Provider>
}
