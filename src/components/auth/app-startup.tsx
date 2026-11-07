"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useAccess } from "./access-provider"
import { createRouteWarmer, isApplicationPath, startupRoutes } from "@/lib/startup"
import "./app-startup.css"

const RouteWarmupContext = createContext<(path: string) => void>(() => {})
export function useRouteWarmup() { return useContext(RouteWarmupContext) }

export function AppStartup({ children }: { children: ReactNode }) {
  const router = useRouter(), pathname = usePathname()
  const { ready, userId, role, profile, error, refreshProfile } = useAccess()
  const inApplication = isApplicationPath(pathname)
  const pathRef = useRef(pathname)
  pathRef.current = pathname
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

  useEffect(() => {
    if (!ready || !inApplication || !userId || !profile?.onboarding_complete) return
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
    if (connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g") return
    const paths = startupRoutes(role).filter(path => path !== pathRef.current)
    // Start after first paint and spread requests out. Do not hold the startup
    // screen for routes, covers, the editor, or optional account data.
    let index = 0
    let timer: ReturnType<typeof setTimeout>
    function next() {
      if (index >= paths.length) return
      warmer.warm(paths[index++])
      timer = setTimeout(next, 300)
    }
    timer = setTimeout(next, 350)
    return () => clearTimeout(timer)
  }, [ready, inApplication, userId, role, profile?.onboarding_complete, warmer])

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
