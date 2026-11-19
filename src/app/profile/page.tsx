"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { createClient } from "@/utils/supabase/client"
import { useAccess } from "@/components/auth/access-provider"

import { StudentCard } from "./student-card"

type Family = { account_id: string; name: string; role: string }

export default function ProfilePage() {
  const router = useRouter()
  const [familyState, setFamilyState] = useState<{ owner: string | null; items: Family[] }>({ owner: null, items: [] })
  const [pending, setPending] = useState("")
  const [message, setMessage] = useState("")
  const { isAdmin: admin, profile, ready, userId, error: profileError } = useAccess()
  const family = familyState.owner === userId ? familyState.items : []
  function setFamily(items: Family[]) { setFamilyState({ owner: userId, items }) }
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const scanner = useRef<import("html5-qrcode").Html5Qrcode | null>(null)

  useEffect(() => {
    if (!ready || profileError) return
    if (!userId) { router.replace("/login"); return }
    if (!profile?.onboarding_complete) { router.replace("/register"); return }
    if (profile.role === "student") return
    let active = true
    const controller = new AbortController()
    setFamily([])
    void createClient().rpc("my_family_links").abortSignal(controller.signal).then(({ data, error }) => {
      if (!active) return
      if (error) setMessage("Не удалось загрузить связанные аккаунты.")
      else setFamily(data || [])
    })
    return () => { active = false; controller.abort() }
  }, [ready, userId, profile?.id, profile?.role, profile?.onboarding_complete, profileError, router])

  useEffect(() => {
    setPending(sessionStorage.getItem("tlc.pending-student") || "")
    return () => {
      if (scanner.current?.isScanning) void scanner.current.stop().catch(() => {})
    }
  }, [])

  function acceptCode(raw: string) {
    try {
      const url = new URL(raw)
      if (url.origin !== window.location.origin || url.pathname !== "/link-student") throw Error()
      const token = url.searchParams.get("token") || ""
      if (!/^[0-9a-f-]{36}$/i.test(token)) throw Error()
      setPending(token)
      sessionStorage.setItem("tlc.pending-student", token)
      void stop()
    } catch {
      setMessage("Это не QR ученика Brick Studio.")
    }
  }

  async function stop() {
    if (scanner.current?.isScanning) await scanner.current.stop()
    setScanning(false)
  }

  async function scan() {
    setMessage("")
    setScanning(true)
    try {
      const { Html5Qrcode } = await import("html5-qrcode")
      const instance = new Html5Qrcode("family-qr-reader")
      scanner.current = instance
      await instance.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 220, height: 220 } }, acceptCode, () => {})
    } catch {
      setScanning(false)
      setMessage("Не удалось открыть камеру. Разрешите доступ или отсканируйте QR камерой телефона.")
    }
  }

  async function link() {
    setBusy(true)
    setMessage("")
    try {
      const { data, error } = await createClient().rpc("link_student_by_qr", { p_token: pending })
      if (error) throw error
      setMessage(`Ученик ${data} связан с вашим аккаунтом.`)
      setPending("")
      sessionStorage.removeItem("tlc.pending-student")
      const links = await createClient().rpc("my_family_links")
      if (!links.error) setFamily(links.data || [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось связать аккаунты.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh bg-[#f3ead7] p-5 md:p-12">
      <div className={`mx-auto grid max-w-2xl gap-5 ${profile?.role === "student" ? "student-layout" : ""}`}>
        {profile && profile.role !== "parent" && <Link href="/dashboard" className="font-bold text-cyan-800">← К проектам</Link>}
        {profile?.role === "parent" && <button type="button" className="justify-self-end font-bold text-cyan-800" onClick={async () => { await createClient().auth.signOut(); router.replace("/"); router.refresh() }}>Выйти из аккаунта</button>}
        {profile?.role === "student" ? <StudentCard key={profile.id} profile={profile} /> :
        <Card className="grid gap-4 rounded-3xl bg-white p-6">
          <h1 className="text-3xl font-black">Профиль</h1>
          {profileError && <p role="alert">Не удалось обновить профиль. Попробуйте позже.</p>}
          {profile ? <>
            <h2 className="text-2xl font-bold">{profile.nickname}</h2>
            <p>{({ student: "Ученик", teacher: "Учитель", parent: "Родитель" })[profile.role]}{profile.role !== "parent" && profile.age !== null && <> · Возраст: {profile.age}</>}</p>
            {profile.role === "teacher" && <p>{profile.disciplines.join(" · ")}</p>}
            {profile.role === "teacher" && <Link href="/avatar" className="justify-self-start rounded-xl bg-cyan-700 px-5 py-3 font-bold text-white">Мои персонажи</Link>}
            {(profile.role === "teacher" || admin) && <Link href="/teacher/achievements" className="font-bold text-cyan-800">{admin ? "Прогресс и достижения учеников" : "Выдать достижение ученику"}</Link>}
            {profile.role !== "parent" && admin && <Link href="/instructions" className="font-bold text-cyan-800">Управление инструкциями</Link>}
            {profile.role === "teacher" && !admin && <Link href="/admin/instructions/drive" className="font-bold text-cyan-800">Добавить инструкцию</Link>}
            {profile.role === "parent" && <section className="grid gap-3"><h2 className="text-xl font-bold">Связь с учеником</h2><p>{family.length ? "Можно связать ещё одного ученика." : "Чтобы завершить регистрацию, отсканируйте QR из профиля ученика."}</p>{pending ? <><p>QR ученика получен. Подтвердите связь аккаунтов.</p><Button disabled={busy} onClick={link}>{busy ? "Связываем…" : "Связать аккаунты"}</Button><button onClick={() => { setPending(""); sessionStorage.removeItem("tlc.pending-student") }}>Отмена</button></> : <Button onClick={() => void scan()} disabled={scanning}>Сканировать QR ученика</Button>}<div id="family-qr-reader" />{scanning && <Button variant="outline" onClick={() => void stop()}>Закрыть камеру</Button>}</section>}
            <section><h2 className="text-xl font-bold">Связанные ученики</h2>{family.map((item) => <p key={item.account_id} className="mt-2 rounded-xl border p-3">{item.name}</p>)}{!family.length && <p className="mt-2 text-slate-600">Пока нет связанных аккаунтов.</p>}</section>
          </> : <p>Загружаем профиль…</p>}
          {message && <p role="status">{message}</p>}
        </Card>}
      </div>
    </main>
  )
}
