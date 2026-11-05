"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { LiveOrb } from "@/components/ui/live-orb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  const [lookOverride, setLookOverride] = React.useState<{
    x: number
    y: number
    squint?: number
  } | null>(null)
  const [blinkCount, setBlinkCount] = React.useState(0)
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
    const val = e.target.value
    setLogin(val)
    const x = Math.min(0.45, Math.max(-0.45, (val.length - 12) * 0.035))
    setLookOverride({ x, y: 0.35 })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      const next = await signInStudentWithSupabase(window.localStorage, {
        login,
        password,
      })
      setBlinkCount((c) => c + 1)
      setStatus({
        message: `Добро пожаловать, ${next.user?.nickname}! Переходим к проектам...`,
        isError: false,
      })
      setTimeout(() => {
        router.push("/")
      }, 500)
    } catch (err) {
      setStatus({
        message: err instanceof Error ? err.message : "Не удалось выполнить вход.",
        isError: true,
      })
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[radial-gradient(circle_at_14%_18%,rgba(2,199,234,0.15)_0%,transparent_42%),radial-gradient(circle_at_86%_82%,rgba(124,106,247,0.12)_0%,transparent_45%),#f4f8fa]">
      <header className="min-h-[74px] px-5 md:px-16 py-3.5 flex items-center justify-between gap-4 bg-[#02c7ea]">
        <Link
          href="/"
          className="text-[19px] font-black tracking-wide text-[#002c39] inline-flex items-center gap-2.5"
        >
          TLC
          <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#002c39]/10 text-[#002c39]">
            TechLabCode
          </span>
        </Link>
        <Link
          href="/"
          className="text-sm font-extrabold text-[#053543] px-4 py-2.5 rounded-full bg-white/85 hover:bg-white shadow-sm transition-transform hover:-translate-y-0.5"
        >
          ← К проектам
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-4 py-10">
        <Card className="w-full max-w-[460px]">
          <CardHeader className="items-center text-center pb-2">
            <div
              onClick={() => setBlinkCount((c) => c + 1)}
              title="Нажмите, чтобы орб моргнул"
              className="w-[116px] h-[116px] rounded-full grid place-items-center bg-[radial-gradient(circle_at_50%_50%,#e5f9fd_0%,#f5fbfd_72%)] border border-[#d4ecf3] shadow-[0_14px_32px_rgba(0,152,184,0.12)] mb-3 transition-transform hover:scale-105 cursor-pointer"
            >
              <LiveOrb
                size={100}
                variant={auth.avatar.variant}
                color={auth.avatar.color}
                eyeColor={auth.avatar.eyeColor}
                colors={auth.avatar.colors}
                expression={auth.avatar.expression}
                lookOverride={lookOverride}
                blinkCount={blinkCount}
              />
            </div>
            <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#008da9]">
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
                <Label htmlFor="loginInput">Логин ученика</Label>
                <Input
                  id="loginInput"
                  name="login"
                  type="text"
                  maxLength={64}
                  required
                  autoComplete="username"
                  placeholder="Например, Alua"
                  value={login}
                  onChange={handleLoginChange}
                  onBlur={() => setLookOverride(null)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() =>
                    setLookOverride({ x: 0, y: -0.55, squint: 0.82 })
                  }
                  onBlur={() => setLookOverride(null)}
                />
              </div>

              {status && (
                <p
                  role="status"
                  className={`rounded-xl px-3.5 py-2.5 text-[13px] font-bold ${
                    status.isError
                      ? "bg-[#fff1ee] text-[#a9352e]"
                      : "bg-[#e3f9eb] text-[#165e36]"
                  }`}
                >
                  {status.message}
                </p>
              )}

              <div className="grid gap-2.5 mt-1.5">
                <Button id="studentLoginBtn" type="submit" className="w-full">
                  Войти в аккаунт <span aria-hidden="true">→</span>
                </Button>

                <Button
                  id="teacherLoginBtn"
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => router.push("/admin/instructions/drive")}
                >
                  <span>Панель учителя</span>
                  <span aria-hidden="true">→</span>
                </Button>
              </div>
            </form>

            <div className="flex items-center gap-3 my-5 text-xs font-bold uppercase tracking-wider text-[#8299a3]">
              <span className="h-px flex-1 bg-[#e1ecef]" />
              <span>или</span>
              <span className="h-px flex-1 bg-[#e1ecef]" />
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3.5 p-4 rounded-[18px] bg-gradient-to-br from-[#edfcff] to-[#f4f1ff] border border-[#ccebf2]">
              <div className="text-center sm:text-left">
                <strong className="block text-sm font-extrabold text-[#10303b]">
                  Ещё нет аккаунта?
                </strong>
                <small className="text-xs text-[#587580]">
                  Начните с выбора живого 3D-аватара
                </small>
              </div>
              <Link
                id="registerRedirect"
                href="/avatar"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-full bg-[#02c7ea] text-[#042b36] text-sm font-extrabold shadow-[0_8px_20px_rgba(2,199,234,0.25)] hover:bg-[#00b4d6] transition-transform hover:-translate-y-0.5 whitespace-nowrap"
              >
                Регистрация <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </CardContent>
          <CardFooter className="justify-center pt-0 pb-6">
            <span className="text-xs text-[#788d95]">
              Аватар:{" "}
              <strong className="text-[#23424d]">{auth.avatar.name}</strong>
            </span>
          </CardFooter>
        </Card>
      </main>
    </div>
  )
}
