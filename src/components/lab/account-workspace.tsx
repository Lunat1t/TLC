"use client"
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useAccess } from "@/components/auth/access-provider"
import { readGuestWorkspaceValues, writeGuestWorkspaceSection, type WorkspaceSection, type WorkspaceValues } from "@/lib/guest-workspace"
import { createWorkspaceSync } from "@/lib/workspace-sync"

type Store = {
  userId: string | null
  values: WorkspaceValues
  ready: boolean
  error: string
  saving: boolean
  update: (section: WorkspaceSection, value: unknown, expectedValue?: unknown) => boolean
  save: (section: WorkspaceSection, value: unknown, expectedValue?: unknown) => Promise<void>
  refresh: () => Promise<void>
}
const Context = createContext<Store>({ userId: null, values: {}, ready: false, error: "", saving: false, update: () => false, save: async () => { throw Error("Рабочее место не загружено.") }, refresh: async () => {} })
export const useAccountWorkspace = () => useContext(Context)

export function AccountWorkspaceProvider({ children }: { children: ReactNode }) {
  const { userId, ready } = useAccess()
  return <AccountWorkspaceSession key={userId || "guest"} userId={userId} accessReady={ready}>{children}</AccountWorkspaceSession>
}

function AccountWorkspaceSession({ userId, accessReady, children }: { userId: string | null; accessReady: boolean; children: ReactNode }) {
  const [state, setState] = useState({ values: {} as WorkspaceValues, ready: false, error: "", saving: false, conflicts: [] as WorkspaceSection[] })
  const engine = useRef<ReturnType<typeof createWorkspaceSync> | null>(null)
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
    // Each session instance owns its requests. Strict-mode cleanup never revives old requests.
    // Duplicate tabs inherit sessionStorage; a fresh instance ID prevents shared draft keys.
    const tabId = crypto.randomUUID()
    const sync = createWorkspaceSync({ userId, tabId, fetch: window.fetch.bind(window), storage: localStorage })
    engine.current = sync
    const unsubscribe = sync.subscribe(() => setState(sync.getSnapshot()))
    const refresh = () => { void sync.refresh().catch(() => {}) }
    const visibleRefresh = () => { if (document.visibilityState === "visible") refresh() }
    refresh()
    window.addEventListener("focus", refresh)
    window.addEventListener("online", refresh)
    document.addEventListener("visibilitychange", visibleRefresh)
    const timer = window.setInterval(visibleRefresh, 10_000)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refresh)
      window.removeEventListener("online", refresh)
      document.removeEventListener("visibilitychange", visibleRefresh)
      unsubscribe()
      sync.dispose()
      if (engine.current === sync) engine.current = null
    }
  }, [userId, accessReady])

  const update = useCallback((section: WorkspaceSection, value: unknown, expected?: unknown) => {
    if (userId) return engine.current?.update(section, value, expected) ?? false
    if (!guestReady.current) return false
    if (!writeGuestWorkspaceSection(localStorage, section, value)) {
      setState(old => ({ ...old, error: "Не удалось сохранить изменения в браузере." }))
      return false
    }
    guest.current = { ...guest.current, [section]: value }
    setState(old => ({ ...old, values: guest.current, error: "" }))
    return true
  }, [userId])
  const save = useCallback(async (section: WorkspaceSection, value: unknown, expected?: unknown) => {
    if (!userId) {
      if (!update(section, value)) throw new Error("Не удалось сохранить изменения в браузере.")
      return
    }
    if (!engine.current) throw new Error("Дождитесь загрузки рабочего места.")
    await engine.current.save(section, value, expected)
  }, [userId, update])
  const refresh = useCallback(async () => { await engine.current?.refresh() }, [])
  function downloadRecovery() {
    const data = engine.current?.backup() ?? { current: state.values }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "tlc-workspace-backup.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <Context.Provider value={{ userId, values: state.values, ready: accessReady && state.ready, error: state.error, saving: state.saving, update, save, refresh }}>
    {children}
    {userId && state.error && <div className="workspace-sync-status" role="alert">
      {state.error}
      <button onClick={downloadRecovery}>Скачать копию</button>
      {state.conflicts.length ? <button onClick={() => { void engine.current?.useCloud().catch(() => {}) }}>Открыть облачную версию</button>
        : <button onClick={() => { void refresh().catch(() => {}) }}>Повторить синхронизацию</button>}
    </div>}
  </Context.Provider>
}
