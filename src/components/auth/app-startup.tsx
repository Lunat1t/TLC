"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAccess } from "./access-provider"
import { createRouteWarmer, isApplicationPath } from "@/lib/startup"
import "./app-startup.css"

const RouteWarmupContext = createContext<(path: string) => void>(() => {})
export function useRouteWarmup() { return useContext(RouteWarmupContext) }

export function AppStartup({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname()
  const { ready, userId, profile, error, refreshProfile } = useAccess()
  const inApplication = isApplicationPath(pathname)
  const [slow, setSlow] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const warmer = useMemo(() => createRouteWarmer(path => router.prefetch(path)), [router])
  const waiting = inApplication && !ready
  const failed = inApplication && !!error && !profile
  const blocked = waiting || failed

  useEffect(() => { warmer.clear() }, [userId, warmer])
  useEffect(() => {
    setSlow(false)
    if (!waiting) return
    const timer = window.setTimeout(() => setSlow(true), 10_000)
    return () => window.clearTimeout(timer)
  }, [waiting, attempt])

  function retry() {
    setAttempt(value => value + 1)
    if (userId) void refreshProfile()
    else window.location.reload()
  }

  return <RouteWarmupContext.Provider value={warmer.warm}>
    <div className="tlc-startup-app" inert={blocked ? true : undefined} aria-hidden={blocked ? true : undefined}>{children}</div>
    {blocked && <div className="tlc-startup-overlay">
      <div className="tlc-startup-card" role={failed || slow ? "alert" : "status"} aria-live="polite">
        <div className="tlc-startup-logo" aria-hidden="true">TLC</div>
        <h1>{failed ? "Не удалось загрузить настройки" : slow ? "Подключение занимает больше времени" : "Подготавливаем TLC"}</h1>
        <p>{failed || slow ? "Проверь подключение к интернету и попробуй ещё раз." : userId ? "Загружаем твой профиль и настройки…" : "Проверяем вход…"}</p>
        {failed || slow ? <button type="button" onClick={retry}>Попробовать ещё раз</button> : <>
          <span className="tlc-startup-spinner" aria-hidden="true" />
          <small>Остальные разделы подготовим в фоне</small>
        </>}
      </div>
    </div>}
  </RouteWarmupContext.Provider>
}
