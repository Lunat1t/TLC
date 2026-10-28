"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  AVATAR_PRESETS,
  LiveOrb,
  type LiveOrbVariant,
} from "@/components/ui/live-orb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  loadAuthState,
  registerStudentWithSupabase,
  type AvatarState,
} from "@/lib/auth"

export default function AvatarPage() {
  const router = useRouter()
  const [selected, setSelected] = React.useState<AvatarState>(
    () => loadAuthState(null).avatar
  )
  const [login, setLogin] = React.useState("")
  const [nickname, setNickname] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [lookOverride, setLookOverride] = React.useState<{
    x: number
    y: number
    squint?: number
  } | null>(null)
  const [blinkCount, setBlinkCount] = React.useState(0)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [status, setStatus] = React.useState<{
    text: string
    isError: boolean
  } | null>(null)

  React.useEffect(() => {
    const state = loadAuthState(window.localStorage)
    setSelected(state.avatar)
    if (state.user?.login) {
      setLogin(state.user.login)
    }
    if (state.user?.nickname) {
      setNickname(state.user.nickname)
    }
  }, [])

  function selectPreset(presetId: string) {
    const preset = AVATAR_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    setSelected({
      presetId: preset.id,
      name: preset.name,
      variant: preset.variant,
      color: preset.color,
      eyeColor: preset.eyeColor,
      colors: [...preset.colors],
    })
    setBlinkCount((c) => c + 1)
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setStatus(null)
    setIsSubmitting(true)
    try {
      const { state } = await registerStudentWithSupabase(window.localStorage, {
        login,
        password,
        nickname: nickname.trim() || login.trim(),
        avatar: selected,
      })
      setBlinkCount((c) => c + 1)
      setStatus({
        text: `Аккаунт «${state.user?.nickname}» и аватар «${state.avatar.name}» сохранены в Supabase! Переходим к проектам...`,
        isError: false,
      })
      setTimeout(() => {
        router.push("/")
      }, 650)
    } catch (err) {
      setStatus({
        text:
          err instanceof Error
            ? err.message
            : "Не удалось зарегистрировать аккаунт в Supabase.",
        isError: true,
      })
    } finally {
      setIsSubmitting(false)
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
            Регистрация · Live Orb
          </span>
        </Link>
        <Link
          href="/login"
          className="text-sm font-extrabold text-[#053543] px-4 py-2.5 rounded-full bg-white/85 hover:bg-white shadow-sm transition-transform hover:-translate-y-0.5"
        >
          ← Ко входу
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-4 py-8 md:py-12">
        <div className="w-full max-w-[1040px] grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          <Card className="p-7 flex flex-col items-center text-center lg:sticky lg:top-6">
            <Badge className="mb-3.5">Следит глазами за курсором</Badge>
            <div
              onClick={() => setBlinkCount((c) => c + 1)}
              title="Нажмите на сферу, чтобы моргнуть"
              className="w-[240px] h-[240px] rounded-full grid place-items-center my-2.5 bg-[radial-gradient(circle_at_50%_42%,#ffffff_0%,#eaf6fa_68%,#dceef4_100%)] border border-[#d5e8ef] shadow-[0_24px_48px_rgba(7,41,54,0.1),inset_0_2px_8px_#ffffff] cursor-pointer"
            >
              <LiveOrb
                size={216}
                variant={selected.variant}
                color={selected.color}
                eyeColor={selected.eyeColor}
                colors={selected.colors}
                lookOverride={lookOverride}
                blinkCount={blinkCount}
              />
            </div>

            <h2 className="text-2xl font-black tracking-tight text-[#072733] mt-2">
              {selected.name}
            </h2>
            <p className="text-[13px] text-[#617b86] leading-relaxed mt-1.5 mb-4">
              Интерактивная WebGL-сфера с глазами-капсулами (
              <code className="font-mono text-xs text-[#007e9d]">
                radiumcoders/live-orb
              </code>
              ). Сохраняется в вашем профиле Supabase.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBlinkCount((c) => c + 1)}
            >
              Моргнуть глазами 👀
            </Button>
          </Card>

          <Card className="p-6 md:p-8">
            <div className="mb-6">
              <p className="text-[11px] font-black tracking-[0.16em] uppercase text-[#008da9] mb-2">
                РЕГИСТРАЦИЯ В SUPABASE · ВЫБОР АВАТАРА
              </p>
              <h1 className="text-[28px] md:text-[34px] font-black tracking-tight text-[#072733] leading-tight">
                Создайте профиль и выберите Live Orb
              </h1>
              <p className="text-sm text-[#5b747f] mt-2">
                Выберите образ 3D-сферы и укажите логин и пароль — данные
                сохранятся в облачной базе данных Supabase.
              </p>
            </div>

            <div
              id="presetGrid"
              role="group"
              aria-label="Варианты аватара Live Orb"
              className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 mb-6"
            >
              {AVATAR_PRESETS.map((preset) => {
                const isSelected = selected.presetId === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => selectPreset(preset.id)}
                    className={`rounded-[20px] p-3.5 flex flex-col items-center text-center gap-1.5 border-[1.5px] transition-all hover:-translate-y-0.5 ${
                      isSelected
                        ? "border-[#00a8c8] bg-[#f0fcff] shadow-[inset_0_0_0_1px_#00a8c8,0_10px_24px_rgba(0,134,168,0.12)]"
                        : "border-[#d9e7ed] bg-[#fbfdfe] hover:border-[#00b2d4]"
                    }`}
                  >
                    <LiveOrb
                      size={72}
                      variant={preset.variant}
                      color={preset.color}
                      eyeColor={preset.eyeColor}
                      colors={preset.colors}
                    />
                    <span className="text-sm font-extrabold text-[#112d37]">
                      {preset.name}
                    </span>
                    <Badge>{preset.badge}</Badge>
                  </button>
                )
              })}
            </div>

            <form
              id="avatarForm"
              onSubmit={handleRegister}
              className="border-t border-[#e2eef2] pt-5 grid gap-4"
              noValidate
            >
              <div className="flex flex-wrap gap-3.5 items-center pb-2">
                <label className="inline-flex items-center gap-2.5 text-[13px] font-bold text-[#21404c] bg-[#f5fafc] px-3 py-2 rounded-xl border border-[#d7e6ec] cursor-pointer">
                  <input
                    id="bodyColorInput"
                    type="color"
                    value={selected.color}
                    onChange={(e) => {
                      const nextColor = e.target.value
                      setSelected((prev) => ({
                        ...prev,
                        presetId: "custom",
                        name: "Свой Live Orb",
                        variant:
                          prev.variant === "webgl" ? "webgl" : "custom",
                        color: nextColor,
                        colors: [
                          nextColor,
                          prev.colors[1] || "#7DD3C7",
                          prev.colors[2] || "#E8B4D4",
                        ],
                      }))
                    }}
                    className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <span>Цвет сферы</span>
                </label>

                <label className="inline-flex items-center gap-2.5 text-[13px] font-bold text-[#21404c] bg-[#f5fafc] px-3 py-2 rounded-xl border border-[#d7e6ec] cursor-pointer">
                  <input
                    id="eyeColorInput"
                    type="color"
                    value={selected.eyeColor}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        eyeColor: e.target.value,
                      }))
                    }
                    className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer"
                  />
                  <span>Цвет глаз</span>
                </label>

                <label className="inline-flex items-center gap-2 text-[13px] font-bold text-[#21404c] bg-[#f5fafc] px-3 py-2 rounded-xl border border-[#d7e6ec]">
                  <span>Режим:</span>
                  <select
                    id="shaderModeSelect"
                    value={selected.variant}
                    onChange={(e) =>
                      setSelected((prev) => ({
                        ...prev,
                        variant: e.target.value as LiveOrbVariant,
                      }))
                    }
                    className="bg-transparent font-extrabold text-[#122831] focus:outline-none"
                  >
                    <option value="webgl">WebGL Перелив</option>
                    <option value="custom">Сплошной цвет</option>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                  </select>
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="regLoginInput">
                    Логин или Email ученика *
                  </Label>
                  <Input
                    id="regLoginInput"
                    type="text"
                    maxLength={64}
                    required
                    autoComplete="username"
                    placeholder="Например, robo_alex"
                    value={login}
                    onChange={(e) => {
                      const val = e.target.value
                      setLogin(val)
                      const x = Math.min(
                        0.45,
                        Math.max(-0.45, (val.length - 12) * 0.035)
                      )
                      setLookOverride({ x, y: 0.3 })
                    }}
                    onBlur={() => setLookOverride(null)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="nicknameInput">
                    Отображаемое имя (никнейм)
                  </Label>
                  <Input
                    id="nicknameInput"
                    type="text"
                    maxLength={40}
                    autoComplete="nickname"
                    placeholder="Например, CyberPilot"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="regPasswordInput">
                  Пароль (минимум 6 символов) *
                </Label>
                <Input
                  id="regPasswordInput"
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="Придумайте надёжный пароль"
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
                  {status.text}
                </p>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-[#e2eef2]">
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center min-h-[48px] px-5 py-2.5 rounded-full border border-[#c7d9e0] bg-white text-[#23424d] text-sm font-bold hover:bg-[#f2f8fa]"
                >
                  ← Уже есть аккаунт? Войти
                </Link>
                <Button
                  id="saveAvatarBtn"
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-7"
                >
                  {isSubmitting
                    ? "Сохраняем в Supabase..."
                    : "Зарегистрироваться с этим аватаром →"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </main>
    </div>
  )
}
