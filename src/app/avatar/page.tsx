"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AvatarEditor } from "@/components/profile/avatar-editor"
import type { AvatarState } from "@/lib/auth"
import { createClient } from "@/utils/supabase/client"

type EditableProfile = { role: string; onboarding_complete: boolean; avatar: AvatarState | null }

export default function AvatarPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<EditableProfile | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    async function load() {
      const client = createClient()
      const { data: { user } } = await client.auth.getUser()
      if (!user) {
        router.replace("/login?next=/avatar")
        return
      }
      const { data, error: queryError } = await client
        .from("profiles")
        .select("role,onboarding_complete,avatar")
        .eq("id", user.id)
        .maybeSingle()
      if (queryError) throw queryError
      if (!data?.onboarding_complete) {
        router.replace("/register")
        return
      }
      if (data.role !== "student" && data.role !== "teacher") {
        router.replace("/profile")
        return
      }
      if (active) setProfile(data)
    }
    void load().catch(() => { if (active) setError("Не удалось открыть редактор аватара.") })
    return () => { active = false }
  }, [router])

  if (error) return <main className="grid min-h-dvh place-items-center bg-[#f4f8fa] p-6 text-center text-slate-900"><div><p>{error}</p><button type="button" className="mt-4 rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950" onClick={() => router.push("/profile")}>В профиль</button></div></main>
  if (!profile) return <main className="grid min-h-dvh place-items-center bg-[#f4f8fa] text-sm font-semibold text-slate-900">Загружаем аватар…</main>

  return <AvatarEditor initialAvatar={profile.avatar} />
}
