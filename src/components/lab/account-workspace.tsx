"use client"
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { useAccess } from "@/components/auth/access-provider"
import {
  readGuestWorkspaceValues,
  writeGuestWorkspaceSection,
  type WorkspaceSection,
  type WorkspaceValues,
} from "@/lib/guest-workspace"

type Section = WorkspaceSection
type Values = WorkspaceValues
type Store = {
  values: Values
  ready: boolean
  error: string
  saving: boolean
  update: (section: Section, value: unknown) => boolean
}
const Context = createContext<Store>({ values: {}, ready: false, error: "", saving: false, update: () => false })
export const useAccountWorkspace = () => useContext(Context)

export function AccountWorkspaceProvider({ children }: { children: ReactNode }) {
  const { userId } = useAccess()
  return <AccountWorkspaceSession key={userId || "guest"} userId={userId}>{children}</AccountWorkspaceSession>
}

function AccountWorkspaceSession({ userId, children }: { userId: string | null; children: ReactNode }) {
  const [values, setValues] = useState<Values>({})
  const [ready, setReady] = useState(false)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [recoveryConflict, setRecoveryConflict] = useState(false)
  const tab = useRef("")
  const revisions = useRef<Partial<Record<Section, number>>>({})
  const pending = useRef<Values>({})
  const alive = useRef(true)
  const running = useRef(false)

  useEffect(() => {
    try {
      tab.current = sessionStorage.getItem("tlc-workspace-tab") || crypto.randomUUID()
      sessionStorage.setItem("tlc-workspace-tab", tab.current)
    } catch {
      tab.current = crypto.randomUUID()
    }
    alive.current = true
    const controller = new AbortController()

    if (!userId) {
      setValues(readGuestWorkspaceValues(localStorage))
      setError("")
      setReady(true)
      return () => {
        alive.current = false
        controller.abort()
      }
    }

    void (async () => {
      try {
        const response = await fetch("/api/workspace", { cache: "no-store", signal: controller.signal })
        const result = await response.json()
        if (!response.ok) throw Error(result.error?.message || "Не удалось загрузить рабочее место.")
        if (result.userId !== userId) throw Error("Аккаунт изменился. Обновите страницу.")
        const initial: Values = {}
        for (const row of result.sections) {
          initial[row.section as Section] = row.value
          revisions.current[row.section as Section] = row.revision
        }
        // Only data already scoped to this account can be migrated from a shared tablet.
        // Guest (:guest) local storage is intentionally never merged into an authenticated account.
        for (const section of ["layout", "board"] as const) {
          if (initial[section] !== undefined) continue
          try {
            const raw = localStorage.getItem(`${section === "layout" ? "tlc-desktop-layout-v1" : "tlc-lab-board-v1"}:${userId}`)
            if (raw) {
              const value = JSON.parse(raw)
              if ((section === "board" && Array.isArray(value)) || (section === "layout" && value && typeof value === "object" && !Array.isArray(value))) {
                initial[section] = value
                pending.current[section] = value
              }
            }
          } catch {}
        }
        const cloudOnly = { ...initial }
        let conflict = false
        for (const section of ["settings", "layout", "board"] as const) {
          try {
            const raw = localStorage.getItem(`tlc-workspace-recovery:${userId}:${section}:${tab.current}`)
            if (!raw) continue
            const saved = JSON.parse(raw)
            if (saved.revision === (revisions.current[section] || 0)) {
              initial[section] = saved.value
              pending.current[section] = saved.value
            } else {
              conflict = true
            }
          } catch {}
        }
        if (!alive.current) return
        setValues(initial)
        if (conflict) {
          setValues(cloudOnly)
          pending.current = {}
          setRecoveryConflict(true)
          setError("На этом устройстве есть несохранённые изменения другой версии. Скачайте копию перед открытием облачной версии.")
          return
        }
        setReady(true)
        if (Object.keys(pending.current).length) void flush()
      } catch (e) {
        if (alive.current && !controller.signal.aborted) {
          setError(e instanceof Error ? e.message : "Ошибка загрузки рабочего места.")
        }
      }
    })()

    return () => {
      alive.current = false
      controller.abort()
    }
    // The keyed session is replaced completely whenever the account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function flush() {
    if (running.current || !alive.current || !userId) return
    running.current = true
    setSaving(true)
    let flight: { section: Section; value: unknown } | null = null
    try {
      while (alive.current && Object.keys(pending.current).length) {
        const section = Object.keys(pending.current)[0] as Section
        const value = pending.current[section]
        delete pending.current[section]
        flight = { section, value }
        const response: Response = await fetch("/api/workspace", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, section, value, revision: revisions.current[section] || 0 }),
        })
        const result = (await response.json()) as {
          userId?: string
          revision?: number
          error?: { message?: string }
        }
        if (!alive.current) return
        if (!response.ok || result.userId !== userId) {
          if (pending.current[section] === undefined) pending.current[section] = value
          throw Error(result.error?.message || "Аккаунт изменился. Обновите страницу.")
        }
        revisions.current[section] = result.revision
        try {
          if (pending.current[section] !== undefined) {
            localStorage.setItem(
              `tlc-workspace-recovery:${userId}:${section}:${tab.current}`,
              JSON.stringify({ value: pending.current[section], revision: result.revision }),
            )
          } else {
            localStorage.removeItem(`tlc-workspace-recovery:${userId}:${section}:${tab.current}`)
          }
        } catch {}
        flight = null
      }
      if (alive.current) setError("")
    } catch (e) {
      if (flight && pending.current[flight.section] === undefined) pending.current[flight.section] = flight.value
      if (alive.current) {
        setReady(false)
        setError(e instanceof Error ? e.message : "Не удалось сохранить рабочее место.")
      }
    } finally {
      running.current = false
      if (alive.current) setSaving(false)
    }
  }

  function update(section: Section, value: unknown) {
    if (!ready) return false
    if (!userId) {
      if (!writeGuestWorkspaceSection(localStorage, section, value)) {
        setError("Не удалось сохранить изменения в браузере.")
        return false
      }
      setError("")
      setValues(old => ({ ...old, [section]: value }))
      return true
    }
    try {
      localStorage.setItem(
        `tlc-workspace-recovery:${userId}:${section}:${tab.current}`,
        JSON.stringify({ value, revision: revisions.current[section] || 0 }),
      )
    } catch {}
    pending.current[section] = value
    setValues(old => ({ ...old, [section]: value }))
    void flush()
    return true
  }

  function downloadRecovery() {
    const data: Record<string, unknown> = { current: values, pending: pending.current }
    for (const section of ["settings", "layout", "board"]) {
      try {
        data[section] = JSON.parse(localStorage.getItem(`tlc-workspace-recovery:${userId}:${section}:${tab.current}`) || "null")
      } catch {}
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "tlc-workspace-backup.json"
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <Context.Provider value={{ values, ready, error, saving, update }}>
      {children}
      {userId && error && (
        <div className="workspace-sync-status" role="alert">
          {error}
          <>
            <button onClick={downloadRecovery}>Скачать копию</button>
            {recoveryConflict ? (
              <button onClick={() => { setRecoveryConflict(false); setError(""); setReady(true) }}>
                Открыть облачную версию
              </button>
            ) : (
              <button onClick={() => location.reload()}>Повторить загрузку</button>
            )}
          </>
        </div>
      )}
    </Context.Provider>
  )
}
