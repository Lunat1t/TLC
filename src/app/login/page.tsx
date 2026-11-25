"use client"

import * as React from "react"
import Link from "next/link"
import { afterLoginPath } from "@/lib/auth-destination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  loadAuthState,
  signInStudentWithSupabase,
} from "@/lib/auth"

export default function LoginPage() {
  const [busy, setBusy] = React.useState(false)
  const [login, setLogin] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [status, setStatus] = React.useState<{
    message: string
    isError: boolean
  } | null>(null)

  React.useEffect(() => {
    const loaded = loadAuthState(window.localStorage)
    if (loaded.user?.login) {
      setLogin(loaded.user.login)
    }
  }, [])

  function handleLoginChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLogin(e.target.value)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const next = await signInStudentWithSupabase(window.localStorage, {
        login,
        password,
      })
      setStatus({
        message: `Добро пожаловать, ${next.user?.nickname}! Переходим к проектам...`,
        isError: false,
      })
      const destination = new URLSearchParams(window.location.search).get("next")
      window.location.replace(sessionStorage.getItem("tlc.pending-student") ? "/settings" : afterLoginPath(destination))
    } catch (err) {
      setBusy(false)
      setStatus({
        message: err instanceof Error ? err.message : "Не удалось выполнить вход.",
        isError: true,
      })
    }
  }

  return (
    <div className="login-page min-h-dvh flex flex-col paper-grid">
      <header className="min-h-[74px] px-5 md:px-16 py-3.5 flex items-center justify-between gap-4 bg-[#fffdf8] border-b-2 border-[#1a1813]">
        <Link
          href="/dashboard"
          className="text-[19px] font-bold tracking-wide text-[#1a1814] inline-flex items-center gap-2.5"
        >
          Brick Studio
        </Link>
        <Link
          href="/dashboard"
          prefetch={false}
          className="text-sm font-bold text-[#1f1d18] px-4 py-2.5 rounded-md bg-white/85 hover:bg-white shadow-sm transition-transform hover:-translate-y-0.5"
        >
          ← К проектам
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-4 py-10">
        <Card className="w-full max-w-[460px]">
          <CardHeader className="items-center text-center pb-2">
            <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-[#5c574d]">
              АВТОРИЗАЦИЯ УЧЕНИКА
            </p>
            <CardTitle className="text-[28px] md:text-[32px]">
              Вход в Brick Studio
            </CardTitle>
            <CardDescription className="max-w-sm">
              Войдите в свой профиль, чтобы синхронизировать проекты роботов
              SPIKE Prime и LEGO EV3.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form id="loginForm" onSubmit={handleSubmit} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="loginInput">Логин</Label>
                <Input
                  id="loginInput"
                  name="login"
                  type="text"
                  maxLength={64}
                  required
                  autoComplete="username"
                  placeholder="Например, Alua_Serik"
                  value={login}
                  onChange={handleLoginChange}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="passwordInput">Пароль</Label>
                <Input
                  id="passwordInput"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {status && (
                <p
                  role="status"
                  className={`rounded-md px-3.5 py-2.5 text-[13px] font-bold ${
                    status.isError
                      ? "bg-[#fff1ee] text-[#a9352e]"
                      : "bg-[#e3f9eb] text-[#165e36]"
                  }`}
                >
                  {status.message}
                </p>
              )}

              <div className="grid gap-2.5 mt-1.5">
                <Button id="studentLoginBtn" type="submit" disabled={busy} className="w-full">
                  Войти в аккаунт <span aria-hidden="true">→</span>
                </Button>

              </div>
            </form>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3.5 p-4 rounded-md bg-gradient-to-br from-[#f7f4ee] to-[#f8f6f0] border border-[#1a181373]">
              <div className="text-center sm:text-left">
                <strong className="block text-sm font-bold text-[#201d19]">
                  Ещё нет аккаунта?
                </strong>
              </div>
              <Link
                id="registerRedirect"
                href="/register"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-md bg-[#fffdf8] border-b-2 border-[#1a1813] text-[#1a1813] text-sm font-bold shadow-[0_3px_0_rgba(30,28,23,0.16)] hover:bg-[#a487f0] transition-transform hover:-translate-y-0.5 whitespace-nowrap"
              >
                Регистрация <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
