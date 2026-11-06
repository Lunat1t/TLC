"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createClient } from "@/utils/supabase/client"

type Access = { role: string | null; isAdmin: boolean; canPublish: boolean }
const emptyAccess: Access = { role: null, isAdmin: false, canPublish: false }
const AccessContext = createContext<Access>(emptyAccess)

// Display hints only. Every protected operation still verifies permissions on the server.
export function AccessProvider({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access>(emptyAccess)
  useEffect(() => {
    const client = createClient()
    let userId: string | null = null
    let checkedAt = 0
    let active = true
    let pending: AbortController | null = null

    async function refresh(id: string | null, force = false) {
      if (!active) return
      if (id !== userId || force) {
        pending?.abort()
        pending = null
        checkedAt = 0
        userId = id
        setAccess(emptyAccess)
      }
      if (!id || pending || Date.now() - checkedAt < 60_000) return
      const controller = new AbortController()
      pending = controller
      try {
        const response = await fetch("/api/instructions/admin-status", {
          cache: "no-store", signal: controller.signal,
        })
        const data = response.ok ? await response.json() : emptyAccess
        if (active && pending === controller) {
          setAccess({ role: data.role ?? null, isAdmin: data.isAdmin === true, canPublish: data.canPublish === true })
          checkedAt = Date.now()
        }
      } catch {
        // Keep the last display hints on a transient network failure.
      } finally {
        if (pending === controller) pending = null
      }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      // Run outside the Supabase auth lock. INITIAL_SESSION also supplies the initial user.
      window.setTimeout(() => void refresh(session?.user.id ?? null, event === "USER_UPDATED"), 0)
    })
    function onVisible() {
      if (document.visibilityState === "visible") void refresh(userId)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      active = false
      pending?.abort()
      subscription.unsubscribe()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])
  return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>
}

export function useAccess() { return useContext(AccessContext) }
