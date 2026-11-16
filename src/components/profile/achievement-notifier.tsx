"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { Award, X } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import "./achievement-notifier.css"

type AwardRow = { id: string; achievement_key: string; awarded_at: string }

export function AchievementNotifier() {
  const [achievement, setAchievement] = useState<AwardRow | null>(null)
  const userIdRef = useRef<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((row: AwardRow) => {
    setAchievement(row)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setAchievement(null), 14000)
    try {
      const key = `tlc.achievement-seen.${row.id}`
      // Keep dismissal per tab so every open window can show the achievement.
      sessionStorage.setItem(key, "1")
    } catch {
      // The toast remains available in this tab when storage is disabled.
    }
  }, [])

  useEffect(() => {
    const client = createClient()
    let active = true

    async function attach(userId: string | null) {
      if (!active || userIdRef.current === userId) return
      userIdRef.current = userId
      if (channelRef.current) {
        await client.removeChannel(channelRef.current)
        channelRef.current = null
      }
      setAchievement(null)
      if (!userId) return

      const channel = client
        .channel(`student-achievements-${userId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "student_achievement_awards",
          filter: `student_id=eq.${userId}`,
        }, (payload) => {
          const row = payload.new as AwardRow
          if (row.achievement_key === "mix_and_match_2025_2026") show(row)
        })
        .subscribe()
      channelRef.current = channel

      const { data, error } = await client
        .from("student_achievement_awards")
        .select("id,achievement_key,awarded_at")
        .eq("student_id", userId)
        .order("awarded_at", { ascending: false })
      if (!active || error || userIdRef.current !== userId) return
      for (const row of (data || []) as AwardRow[]) {
        if (row.achievement_key !== "mix_and_match_2025_2026") continue
        try {
          if (!sessionStorage.getItem(`tlc.achievement-seen.${row.id}`)) show(row)
        } catch {
          // In-memory notification still works when storage is disabled.
          show(row)
        }
      }
    }

    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void attach(session?.user?.id || null), 0)
    })
    void client.auth.getSession().then(({ data }) => attach(data.session?.user.id || null))

    return () => {
      active = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      authListener.subscription.unsubscribe()
      if (channelRef.current) void client.removeChannel(channelRef.current)
    }
  }, [show])

  if (!achievement) return null

  return (
    <aside className="achievement-toast" role="status" aria-live="polite">
      <div className="achievement-toast-icon"><Award size={22} /></div>
      <div className="achievement-toast-copy">
        <span>Новое достижение</span>
        <strong>Взболтать, но не смешивать</strong>
        <p>Соревнование Mix and Match 2025–2026.</p>
        <Link href="/avatar#wardrobe" onClick={() => setAchievement(null)}>Открыть гардероб</Link>
      </div>
      <button type="button" className="achievement-toast-close" aria-label="Закрыть уведомление" onClick={() => setAchievement(null)}><X size={17} /></button>
    </aside>
  )
}
