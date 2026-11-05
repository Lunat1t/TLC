"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { loadAuthState, registerStudentWithSupabase } from "@/lib/auth"

export default function RegisterPage() {
  const router = useRouter()
  const [login, setLogin] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [status, setStatus] = React.useState<{ message: string; isError: boolean } | null>(null)

  React.useEffect(() => {
    const existing = loadAuthState(window.localStorage).user?.login
    if (existing) setLogin(existing)
  }, [])

  async function handleRegister(event: React.FormEvent) {
    event.preventDefault()
    setStatus(null)
    setIsSubmitting(true)
    try {
      await registerStudentWithSupabase(window.localStorage, {
        login,
        password,
        avatar: loadAuthState(window.localStorage).avatar,
      })
      setStatus({ message: "Аккаунт создан. Переходим к проектам…", isError: false })
      setTimeout(() => router.push("/"), 650)
    } catch (error) {
      setStatus({
        message: error instanceof Error ? error.message : "Не удалось создать аккаунт.",
        isError: true,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[radial-gradient(circle_at_14%_18%,rgba(2,199,234,0.15)_0%,transparent_42%),radial-gradient(circle_at_86%_82%,rgba(124,106,247,0.12)_0%,transparent_45%),#f4f8fa]">
      <header className="min-h-[74px] px-5 md:px-16 py-3.5 flex items-center justify-between gap-4 bg-[#02c7ea]">
        <Link href="/" className="text-[19px] font-black tracking-wide text-[#002c39] inline-flex items-center gap-2.5">
          TLC <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#002c39]/10 text-[#002c39]">TechLabCode</span>
        </Link>
        <Link href="/login" className="text-sm font-extrabold text-[#053543] px-4 py-2.5 rounded-full bg-white/85 hover:bg-white shadow-sm">← Ко входу</Link>
      </header>
      <main className="flex-1 grid place-items-center px-4 py-10">
        <Card className="w-full max-w-[460px]">
          <CardHeader className="text-center">
            <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#008da9]">РЕГИСТРАЦИЯ УЧЕНИКА</p>
            <CardTitle className="text-[28px] md:text-[32px]">Создать аккаунт</CardTitle>
            <CardDescription>Придумайте логин и пароль, чтобы сохранять проекты роботов.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRegister} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="regLoginInput">Логин ученика</Label>
                <Input id="regLoginInput" type="text" maxLength={64} required autoComplete="username" placeholder="Например, Alua" value={login} onChange={(event) => setLogin(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="regPasswordInput">Пароль (минимум 6 символов)</Label>
                <Input id="regPasswordInput" type="password" required minLength={6} autoComplete="new-password" placeholder="Придумайте пароль" value={password} onChange={(event) => setPassword(event.target.value)} />
              </div>
              {status && <p role="status" className={`rounded-xl px-3.5 py-2.5 text-[13px] font-bold ${status.isError ? "bg-[#fff1ee] text-[#a9352e]" : "bg-[#e3f9eb] text-[#165e36]"}`}>{status.message}</p>}
              <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Создаём аккаунт…" : "Зарегистрироваться →"}</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
