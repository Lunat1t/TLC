"use client"

import { WallpaperPicker } from "@/components/lab/wallpaper-picker"
import Link from "next/link"
import { useEffect, useState, type FormEvent } from "react"
import { ArrowLeft, Palette, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAccess } from "@/components/auth/access-provider"
import { signOutFromSupabase } from "@/lib/auth"
import { NICKNAME_MAX_LENGTH, validateNickname } from "@/lib/account-credentials"
import { defaults, useWorkspaceSettings } from "@/components/lab/workspace-settings"
import { createClient } from "@/utils/supabase/client"
import { JoinSchoolForm } from "@/components/billing/join-school-form"
import { BILLING_PLANS } from "@/lib/billing/plans"

export default function SettingsPage() {
  const { settings, update, error, ready } = useWorkspaceSettings()
  const access = useAccess()
  const router = useRouter()

  const [tab, setTab] = useState<"appearance" | "account">("appearance")
  const [wallpaperBusy, setWallpaperBusy] = useState(false)

  const [nicknameDraft, setNicknameDraft] = useState("")
  const [nicknameBusy, setNicknameBusy] = useState(false)
  const [nicknameError, setNicknameError] = useState("")
  const [nicknameSuccess, setNicknameSuccess] = useState("")
  const [signOutBusy, setSignOutBusy] = useState(false)

  const currentNickname = access.profile?.nickname ?? ""
  useEffect(() => {
    setNicknameDraft(currentNickname)
  }, [currentNickname])

  const categories = [
    { id: "appearance" as const, label: "Оформление", icon: Palette },
    { id: "account" as const, label: "Аккаунт", icon: UserRound },
  ]

  const trimmedDraft = nicknameDraft.trim()
  const nicknameUnchanged = trimmedDraft === currentNickname.trim()
  const canSubmitNickname =
    Boolean(access.userId) &&
    access.ready &&
    Boolean(access.profile) &&
    !nicknameBusy &&
    trimmedDraft.length > 0 &&
    !nicknameUnchanged

  const showDashboardLink = access.role !== "parent"

  async function handleNicknameSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!access.userId || !access.ready || !access.profile || nicknameBusy) return

    setNicknameError("")
    setNicknameSuccess("")

    let nextNickname: string
    try {
      nextNickname = validateNickname(nicknameDraft)
    } catch (err) {
      setNicknameError(err instanceof Error ? err.message : "Проверьте имя.")
      return
    }

    if (nextNickname === currentNickname.trim()) return

    setNicknameBusy(true)
    try {
      const { data, error: saveError } = await createClient()
        .from("profiles")
        .update({ nickname: nextNickname })
        .eq("id", access.userId)
        .select("nickname")
        .single()

      if (saveError || !data?.nickname) {
        setNicknameError("Не удалось сохранить имя. Попробуйте ещё раз.")
        return
      }

      access.updateProfile({ nickname: data.nickname })
      setNicknameDraft(data.nickname)
      setNicknameSuccess("Имя сохранено.")
    } catch {
      setNicknameError("Не удалось сохранить имя. Проверьте подключение и попробуйте ещё раз.")
    } finally {
      setNicknameBusy(false)
    }
  }

  async function handleSignOut() {
    if (signOutBusy) return
    setSignOutBusy(true)
    try {
      await signOutFromSupabase(localStorage)
      router.replace("/login")
      router.refresh()
    } finally {
      setSignOutBusy(false)
    }
  }

  return (
    <main className="workspace-settings">
      <aside className="settings-sidebar">
        {showDashboardLink && (
          <Link href="/dashboard" className="settings-home">
            <ArrowLeft size={18} aria-hidden="true" />
            <span>Мастерская</span>
          </Link>
        )}
        <h1>Настройки</h1>
        <nav aria-label="Категории настроек">
          {categories.map((category) => (
            <button
              type="button"
              key={category.id}
              aria-current={tab === category.id ? "page" : undefined}
              onClick={() => setTab(category.id)}
            >
              <category.icon size={20} aria-hidden="true" />
              <span>{category.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-detail">
        <h2 className="settings-title">
          {categories.find((category) => category.id === tab)?.label}
        </h2>
        <p>
          {access.userId
            ? "Настройки сохраняются в аккаунте и доступны на других устройствах."
            : "Настройки сохраняются в этом браузере. Войдите в аккаунт, чтобы синхронизировать их на других устройствах."}
        </p>

        <section hidden={tab !== "appearance"}>
          <label>
            <span>Тема</span>
            <select
              disabled={!ready || wallpaperBusy}
              value={settings.theme}
              onChange={(e) => update({ theme: e.target.value as typeof settings.theme })}
            >
              <option value="light">Светлая</option>
              <option value="dark">Тёмная</option>
            </select>
          </label>
          <label>
            <span>Фон</span>
            <select
              disabled={!ready || wallpaperBusy}
              value={settings.background}
              onChange={(e) => update({ background: e.target.value as typeof settings.background })}
            >
              <option value="grid">Чертёжная сетка</option>
              <option value="plain">Однотонный</option>
              <option value="dots">Точки</option>
              {settings.wallpaper && <option value="wallpaper">Свои обои</option>}
            </select>
          </label>
          <label>
            <span>Цвет фона</span>
            <input
              disabled={!ready || wallpaperBusy}
              type="color"
              value={settings.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </label>
          <WallpaperPicker onBusyChange={setWallpaperBusy} />
        </section>

        <section hidden={tab !== "account"} className="settings-account-section">
          {access.userId ? (
            <div className="settings-account-panel">
              <form className="settings-nickname-form" onSubmit={handleNicknameSubmit} noValidate>
                <label htmlFor="settings-nickname-input" className="settings-field-label">
                  Имя
                </label>
                <div className="settings-nickname-row">
                  <input
                    id="settings-nickname-input"
                    type="text"
                    className="settings-input"
                    maxLength={NICKNAME_MAX_LENGTH}
                    autoComplete="name"
                    placeholder="Введите имя"
                    disabled={!access.ready || !access.profile || nicknameBusy}
                    value={nicknameDraft}
                    onChange={(e) => {
                      setNicknameDraft(e.target.value)
                      if (nicknameError) setNicknameError("")
                      if (nicknameSuccess) setNicknameSuccess("")
                    }}
                    aria-invalid={Boolean(nicknameError)}
                  />
                  <button
                    type="submit"
                    className="settings-primary-btn"
                    disabled={!canSubmitNickname}
                  >
                    {nicknameBusy ? "Сохраняем…" : "Сохранить"}
                  </button>
                </div>
                {nicknameError && (
                  <p role="alert" className="settings-feedback is-error">
                    {nicknameError}
                  </p>
                )}
                {nicknameSuccess && (
                  <p role="status" className="settings-feedback is-success">
                    {nicknameSuccess}
                  </p>
                )}
                {!nicknameError && access.error && (
                  <p role="alert" className="settings-feedback is-error">
                    {access.error.message}
                  </p>
                )}
              </form>

              <div className="settings-subscription-card" style={{ display: "grid", gap: 12, paddingTop: 14, borderTop: "1px solid rgba(128,150,180,0.22)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <strong style={{ display: "block", fontSize: 15 }}>Подписка и школа</strong>
                    <span style={{ fontSize: 13, opacity: 0.8 }}>
                      {access.entitlements.isAdmin
                        ? "Режим администратора"
                        : access.canAccessLearning
                          ? `Тариф: ${BILLING_PLANS.find((p) => p.id === access.entitlements.plan)?.name ?? access.entitlements.plan ?? "Активен"}${access.entitlements.orgName ? ` · ${access.entitlements.orgName}` : ""}`
                          : "Подписка не активна"}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Link href="/billing" className="settings-secondary-btn" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 14px" }}>
                      Тарифы
                    </Link>
                    {access.canManageSchool && (
                      <Link href="/teacher/school" className="settings-secondary-btn" style={{ minHeight: 44, display: "inline-flex", alignItems: "center", padding: "0 14px" }}>
                        Школа и коды
                      </Link>
                    )}
                  </div>
                </div>
                {access.role !== "parent" && <JoinSchoolForm compact={true} />}
              </div>

              <div className="settings-account-actions">
                <button
                  type="button"
                  className="settings-signout"
                  disabled={signOutBusy}
                  onClick={() => void handleSignOut()}
                >
                  {signOutBusy ? "Выходим…" : "Выйти из аккаунта"}
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-account-anon">
              <Link href="/login" className="settings-primary-btn settings-login-link">
                Войти
              </Link>
              <Link href="/register" className="settings-secondary-btn settings-register-link">
                Регистрация
              </Link>
            </div>
          )}
        </section>

        <button
          type="button"
          disabled={!ready || wallpaperBusy}
          hidden={tab === "account"}
          className="settings-reset"
          onClick={() => update(defaults)}
        >
          Восстановить оформление
        </button>
        {error && tab === "appearance" && <p role="alert" className="settings-feedback is-error">{error}</p>}
      </div>
    </main>
  )
}
