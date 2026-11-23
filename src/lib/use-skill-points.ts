"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { mapKits, tokenSkills } from "./map-kits"
import { computeKitRoadmapState, isMissingRoadmapMigrationError } from "./roadmap"
import { parseRoadmapStatePayload, type RoadmapStatePayload } from "./roadmap-client"

type Kit = (typeof mapKits)[number]
type Balances = Record<string, Record<string, number>>
const preferenceKey = (id: string) => "tlc:points-kit:" + id

export function useSkillPoints(userId: string | null) {
  const [selection, setSelection] = useState<{ owner: string; kit: Kit } | null>(null)
  const [snapshot, setSnapshot] = useState<{
    owner: string
    balances: Balances
    roadmap: RoadmapStatePayload | null
  } | null>(null)
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
    const client = createClient()
    const auth = client.auth
    let revision = 0
    let disposed = false
    async function refresh() {
      const current = ++revision
      const [{ data, error }, roadmapRes] = await Promise.all([
        auth.getUser(),
        client.rpc("tlc_roadmap_state"),
      ])
      if (disposed || current !== revision || error || data.user?.id !== owner) return
      const roadmap =
        !roadmapRes.error && roadmapRes.data
          ? parseRoadmapStatePayload(roadmapRes.data)
          : isMissingRoadmapMigrationError(roadmapRes.error)
            ? null
            : null
      setSnapshot({
        owner,
        balances: data.user.app_metadata.skill_tokens ?? {},
        roadmap,
      })
    }
    void refresh()
    const { data } = auth.onAuthStateChange((_event, session) => {
      if (disposed) return
      revision++
      if (session?.user.id === owner) {
        setSnapshot((prev) =>
          prev?.owner === owner
            ? prev
            : { owner, balances: session.user.app_metadata.skill_tokens ?? {}, roadmap: null }
        )
        window.setTimeout(() => { if (!disposed) void refresh() }, 0)
      } else {
        setSnapshot(null)
      }
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

  const activeSnapshot = snapshot && snapshot.owner === userId ? snapshot : null

  if (activeSnapshot?.roadmap) {
    const state = computeKitRoadmapState(
      kit.id,
      activeSnapshot.roadmap.cards,
      activeSnapshot.roadmap.progress,
      activeSnapshot.roadmap.savedRanks[kit.id] ?? 0
    )
    const amounts = tokenSkills.map((skill) => state.skillPoints[skill.id])
    const total = state.totalPoints
    const target = state.nextThreshold ?? Math.max(total, state.currentFloor || 5)
    return {
      kit,
      setKit,
      balances: activeSnapshot.balances,
      amounts,
      total,
      target,
      nextThreshold: state.nextThreshold,
      tierThresholds: state.tiers.map((t) => (t.tierConfigured ? t.threshold : null)),
      pointsScale: Math.max(target, total, 1),
      rank: state.unlockedRank,
      skillLevels: state.skillLevels,
    }
  }

  const balances = activeSnapshot ? activeSnapshot.balances : null
  const amounts = tokenSkills.map(skill => {
    const value = balances?.[kit.id]?.[skill.id]
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0
  })
  const total = amounts.reduce((sum, value) => sum + value, 0)
  const target = 5
  const fallbackRank = total >= target ? 1 : 0
  return {
    kit,
    setKit,
    balances,
    amounts,
    total,
    target,
    nextThreshold: fallbackRank === 0 ? target : null,
    tierThresholds: [0, target, null, null, null, null, null] as (number | null)[],
    pointsScale: Math.max(target, total),
    rank: fallbackRank,
    skillLevels: tokenSkills.map((skill, idx) => ({
      id: skill.id,
      label: skill.label,
      color: skill.color,
      points: amounts[idx],
      level: 1 + Math.floor(amounts[idx] / 5),
      currentInLevel: amounts[idx] % 5,
      stepSize: 5,
      progressPct: Math.round(((amounts[idx] % 5) / 5) * 100),
    })),
  }
}
