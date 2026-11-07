"use client"

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react"
import { createClient } from "@/utils/supabase/client"
import { createSessionResource } from "@/lib/session-resource"
import type { AvatarState } from "@/lib/auth"

export type SessionProfile = {
  id: string; nickname: string; age: number | null; role: string; disciplines: string[]
  student_link_token: string; onboarding_complete: boolean; avatar: Partial<AvatarState> | null
}
type AccountData = { profile: SessionProfile | null; isAdmin: boolean }
type Access = {
  role: string | null; isAdmin: boolean; canPublish: boolean
  userId: string | null; profile: SessionProfile | null; ready: boolean; error: Error | null
  refreshProfile: () => Promise<SessionProfile | null>
  updateProfile: (patch: Partial<SessionProfile>) => void
}
const AccessContext = createContext<Access>({
  role: null, isAdmin: false, canPublish: false, userId: null, profile: null, ready: false, error: null,
  refreshProfile: async () => null, updateProfile: () => {},
})

// UI display data only: queries use the current JWT and RLS; operations still
// verify access on the server. Never share this cache across users or tabs.
export function AccessProvider({ children }: { children: ReactNode }) {
  const [resource] = useState(() => createSessionResource<AccountData>(async (userId, signal) => {
    const client = createClient()
    const [profileResult, permission] = await Promise.all([
      client.from("profiles").select("id,nickname,age,role,disciplines,student_link_token,onboarding_complete,avatar")
        .eq("id", userId).abortSignal(signal).maybeSingle(),
      client.rpc("is_instruction_admin").abortSignal(signal),
    ])
    if (profileResult.error) throw new Error("Не удалось загрузить профиль. Попробуйте ещё раз.")
    return { profile: profileResult.data as SessionProfile | null, isAdmin: !permission.error && permission.data === true }
  }))
  const snapshot = useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot)

  useEffect(() => {
    const client = createClient()
    let active = true
    let authGeneration = 0
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      const epoch = ++authGeneration
      // Clear old-account data synchronously, but do not call Supabase inside its auth lock.
      resource.identify(session?.user.id ?? null)
      if (!session) return
      window.setTimeout(() => {
        if (!active || epoch !== authGeneration) return
        void resource.refresh()
      }, 0)
    })
    function onVisible() { if (document.visibilityState === "visible") void resource.refresh() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      active = false
      resource.cancel()
      subscription.unsubscribe()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [resource])

  const profile = snapshot.data?.profile ?? null
  const role = profile?.onboarding_complete ? profile.role : null
  const isAdmin = snapshot.data?.isAdmin === true
  return <AccessContext.Provider value={{
    role, isAdmin, canPublish: isAdmin || role === "teacher", profile,
    userId: snapshot.userId, ready: snapshot.ready, error: snapshot.error,
    refreshProfile: async () => (await resource.refresh(true))?.profile ?? null,
    updateProfile: patch => resource.update(current => ({ ...current, profile: current.profile ? { ...current.profile, ...patch } : null })),
  }}>{children}</AccessContext.Provider>
}

export function useAccess() { return useContext(AccessContext) }
