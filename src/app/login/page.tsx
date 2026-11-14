"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
  type AuthState,
} from "@/lib/auth"

export default function LoginPage() {
  const router = useRouter()
  const [auth, setAuth] = React.useState<AuthState>(() => loadAuthState(null))
  const [login, setLogin] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [status, setStatus] = React.useState<{
    message: string
    isError: boolean
  } | null>(null)

  React.useEffect(() => {
    const loaded = loadAuthState(window.localStorage)
    setAuth(loaded)
    if (loaded.user?.login) {
      setLogin(loaded.user.login)
    }
  }, [])

  function handleLoginChange(e: React.ChangeEvent<HTMLInputElement>) {
    setLogin(e.target.value)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const next = await signInStudentWithSupabase(window.localStorage, {
        login,
        password,
      })
      setStatus({
        message: `Добро пожаловать, ${next.user?.nickname}! Переходим к проектам...`,
        isError: false,
      })
      setTimeout(() => {
        router.replace(sessionStorage.getItem("tlc.pending-student") ? "/profile" : new URLSearchParams(window.location.search).get("next") === "/admin/instructions/drive" ? "/admin/instructions/drive" : "/dashboard")
      }, 500)
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Не удалось выполнить вход.",
        isError: true,
      })
    }
  }

  return (
    <div className="login-page min-h-dvh flex flex-col bg-[radial-gradient(circle_at_14%_18%,rgba(0,142,248,0.15)_0%,transparent_42%),radial-gradient(circle_at_86%_82%,rgba(112,60,238,0.12)_0%,transparent_45%),#fafafa]">
      <header className="min-h-[74px] px-5 md:px-16 py-3.5 flex items-center justify-between gap-4 bg-[#008ef8]">
        <Link
          href="/"
          className="text-[19px] font-black tracking-wide text-[#212121] inline-flex items-center gap-2.5"
        >
          TLC
          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#212121]/10 text-[#212121]">
            TechLabCode
          </span>
        </Link>
        <Link
          href="/dashboard"
          prefetch={false}
          className="text-sm font-extrabold text-[#212121] px-4 py-2.5 rounded-full bg-white/85 hover:bg-white shadow-sm transition-transform hover:-translate-y-0.5"
        >
          ← К проектам
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-4 py-10">
        <Card className="w-full max-w-[460px]">
          <CardHeader className="items-center text-center pb-2">
            <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#00589a]">
              АВТОРИЗАЦИЯ УЧЕНИКА
            </p>
            <CardTitle className="text-[28px] md:text-[32px]">
              Вход в TLC
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
                  className={`rounded-xl px-3.5 py-2.5 text-[13px] font-bold ${
                    status.isError
                      ? "bg-[#fdeaea] text-[#ed2929]"
                      : "bg-[#ceefd0] text-[#212121]"
                  }`}
                >
                  {status.message}
                </p>
              )}

              <div className="grid gap-2.5 mt-1.5">
                <Button id="studentLoginBtn" type="submit" className="w-full">
                  Войти в аккаунт <span aria-hidden="true">→</span>
                </Button>

              </div>
            </form>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3.5 p-4 rounded-[18px] bg-gradient-to-br from-[#e6f4fe] to-[#f1ecfd] border border-[#c7e6fd]">
              <div className="text-center sm:text-left">
                <strong className="block text-sm font-extrabold text-[#212121]">
                  Ещё нет аккаунта?
                </strong>
                <small className="text-xs text-[#626262]">
                  Создайте аккаунт ученика
                </small>
              </div>
              <Link
                id="registerRedirect"
                href="/register"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-full bg-[#008ef8] text-[#212121] text-sm font-extrabold shadow-[0_8px_20px_rgba(0,142,248,0.25)] hover:bg-[#008ef8] transition-transform hover:-translate-y-0.5 whitespace-nowrap"
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
