"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { mapKits, tokenSkills } from "./map-kits"

type Kit = typeof mapKits[number]
type Balances = Record<string, Record<string, number>>
const preferenceKey = (id: string) => "tlc:points-kit:" + id

export function useSkillPoints(userId: string | null) {
  const [selection, setSelection] = useState<{ owner: string; kit: Kit } | null>(null)
  const [snapshot, setSnapshot] = useState<{ owner: string; balances: Balances } | null>(null)
  const kit = selection?.owner === userId && selection ? selection.kit : mapKits[0]

  useEffect(() => {
    if (!userId) return
    const owner = userId
    function readKit() {
      try {
        const saved = localStorage.getItem(preferenceKey(owner))
        setSelection({ owner, kit: mapKits.find(item => item.id === saved) ?? mapKits[0] })
      } catch { /* The in-memory selection still works. */ }
    }
    readKit()
    window.addEventListener("storage", readKit)
    const auth = createClient().auth
    let revision = 0
    let disposed = false
    async function refresh() {
      const current = ++revision
      const { data, error } = await auth.getUser()
      if (!disposed && current === revision && !error && data.user?.id === owner) {
        setSnapshot({ owner, balances: data.user.app_metadata.skill_tokens ?? {} })
      }
    }
    const { data } = auth.onAuthStateChange((_event, session) => {
      if (disposed) return
      revision++
      setSnapshot(session?.user.id === owner ? { owner, balances: session.user.app_metadata.skill_tokens ?? {} } : null)
      if (session?.user.id === owner) window.setTimeout(() => { if (!disposed) void refresh() }, 0)
    })
    function refreshVisible() { if (!document.hidden) void refresh() }
    document.addEventListener("visibilitychange", refreshVisible)
    const timer = window.setInterval(refreshVisible, 60_000)
    return () => {
      disposed = true
      data.subscription.unsubscribe()
      window.clearInterval(timer)
      window.removeEventListener("storage", readKit)
      document.removeEventListener("visibilitychange", refreshVisible)
    }
  }, [userId])

  function setKit(next: Kit) {
    if (!userId) return
    setSelection({ owner: userId, kit: next })
    try { localStorage.setItem(preferenceKey(userId), next.id) } catch { /* Storage is optional. */ }
  }

  const balances = snapshot && snapshot.owner === userId ? snapshot.balances : null
  const amounts = tokenSkills.map(skill => {
    const value = balances?.[kit.id]?.[skill.id]
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0
  })
  const total = amounts.reduce((sum, value) => sum + value, 0)
  const target = 5
  return { kit, setKit, balances, amounts, total, target, pointsScale: Math.max(target, total), rank: total >= target ? 1 : 0 }
}
