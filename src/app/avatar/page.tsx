"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AvatarEditor } from "@/components/profile/avatar-editor"
import { useAccess } from "@/components/auth/access-provider"

export default function AvatarPage() {
  const router = useRouter()
  const { profile, userId, ready, error, refreshProfile } = useAccess()

  useEffect(() => {
    if (!ready || error) return
    if (!userId) router.replace("/login?next=/avatar")
    else if (!profile?.onboarding_complete) router.replace("/register")
    else if (profile.role !== "student" && profile.role !== "teacher") router.replace("/profile")
  }, [ready, userId, profile, error, router])

  if (error && !profile) return <main className="grid min-h-dvh place-items-center bg-[#f4f8fa] p-6 text-center text-slate-900"><div><p>Не удалось открыть редактор аватара.</p><button type="button" className="mt-4 rounded-xl bg-cyan-500 px-5 py-3 font-bold text-slate-950" onClick={() => void refreshProfile()}>Попробовать ещё раз</button></div></main>
  if (!profile?.onboarding_complete || (profile.role !== "student" && profile.role !== "teacher")) return <main className="grid min-h-dvh place-items-center bg-[#f4f8fa] text-sm font-semibold text-slate-900">Загружаем аватар…</main>

  return <AvatarEditor initialAvatar={profile.avatar} />
}
