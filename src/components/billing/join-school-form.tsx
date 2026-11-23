"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, KeyRound } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import "./billing.css"

export function JoinSchoolForm({
  initialCode = "",
  compact = false,
}: {
  initialCode?: string
  compact?: boolean
}) {
  const access = useAccess()
  const [code, setCode] = useState(initialCode.toUpperCase())
  const [busy, setBusy] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [error, setError] = useState("")
  const [joinedOrg, setJoinedOrg] = useState<{
    orgName: string
    orgRole: string
  } | null>(null)

  const ent = access.entitlements
  const cleanCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const nextHref = cleanCode ? `/join?code=${encodeURIComponent(cleanCode)}` : "/join"

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !access.userId) return
    setError("")
    setJoinedOrg(null)

    if (cleanCode.length < 8) {
      setError("Введите полный код школы (от 8 символов).")
      return
    }

    setBusy(true)
    try {
      const res = await fetch("/api/school/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: cleanCode }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        org_name?: string
        org_role?: string
        error?: { message?: string }
      }
      if (!res.ok) {
        setError(payload.error?.message || "Не удалось активировать код школы.")
        return
      }
      await access.refreshEntitlements()
      setJoinedOrg({
        orgName: payload.org_name || "Школа",
        orgRole: payload.org_role || "student",
      })
      setCode("")
    } catch {
      setError("Не удалось подключиться к серверу. Попробуйте ещё раз.")
    } finally {
      setBusy(false)
    }
  }

  async function handleLeaveSchool() {
    if (leaveBusy) return
    setError("")
    setLeaveBusy(true)
    try {
      const res = await fetch("/api/school/join", { method: "DELETE" })
      const payload = (await res.json().catch(() => ({}))) as {
        left?: boolean
        error?: { message?: string }
      }
      if (!res.ok) {
        setError(payload.error?.message || "Не удалось выйти из школы.")
        return
      }
      await access.refreshEntitlements()
      setJoinedOrg(null)
    } catch {
      setError("Не удалось подключиться к серверу.")
    } finally {
      setLeaveBusy(false)
    }
  }

  if (!access.userId) {
    return (
      <div className="bs-card">
        <p className="bs-eyebrow">Код приглашения</p>
        <h2 className="bs-title">Войдите, чтобы привязаться к школе</h2>
        <p className="bs-muted">
          После входа или регистрации код школы {cleanCode ? `«${cleanCode}»` : ""} автоматически привяжет ваш аккаунт к классу.
        </p>
        <div className="bs-actions-row">
          <Link href={`/login?next=${encodeURIComponent(nextHref)}`} className="bs-btn-primary">
            Войти
          </Link>
          <Link href={`/register?next=${encodeURIComponent(nextHref)}`} className="bs-btn-secondary">
            Регистрация
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={compact ? "" : "bs-card"} style={compact ? { display: "grid", gap: 12 } : undefined}>
      {!compact && (
        <>
          <p className="bs-eyebrow">Подключение к классу</p>
          <h1 className="bs-title">Введите код школы</h1>
          <p className="bs-muted">
            Код выдаёт учитель в разделе «Школа и коды». После активации откроются роадмап и инструкции вашего курса.
          </p>
        </>
      )}

      {ent.orgId && (
        <div className="bs-alert is-info" style={{ display: "grid", gap: 10 }}>
          <div>
            Вы состоите в организации <strong>{ent.orgName || "Школа"}</strong>
            {ent.groupName ? ` (группа «${ent.groupName}»)` : ""}.
          </div>
          <div className="bs-actions-row">
            <Link href="/map" className="bs-btn-primary">
              <span>Открыть роадмап</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            {ent.orgRole !== "school_admin" && (
              <button
                type="button"
                className="bs-btn-danger"
                disabled={leaveBusy}
                onClick={() => void handleLeaveSchool()}
              >
                {leaveBusy ? "Выходим…" : "Выйти из школы"}
              </button>
            )}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div className="bs-field">
          <label htmlFor={compact ? "settings-school-code" : "join-school-code"}>
            Код приглашения школы
          </label>
          <input
            id={compact ? "settings-school-code" : "join-school-code"}
            type="text"
            className="bs-input bs-input-code"
            placeholder="AB12CD34EF"
            maxLength={32}
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>

        <div className="bs-actions-row">
          <button type="submit" className="bs-btn-primary" disabled={busy || cleanCode.length < 8}>
            <KeyRound size={17} aria-hidden="true" />
            <span>{busy ? "Проверяем код…" : "Активировать код"}</span>
          </button>
          {!compact && (
            <Link href="/billing" className="bs-btn-secondary">
              Тарифы Solo и School
            </Link>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="bs-alert is-error">
          {error}
        </p>
      )}

      {joinedOrg && (
        <div role="status" className="bs-alert is-success" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>
              Готово! Вы присоединились к «{joinedOrg.orgName}».
            </span>
          </div>
          <div className="bs-actions-row">
            <Link
              href={joinedOrg.orgRole === "teacher" ? "/teacher/school" : "/map"}
              className="bs-btn-primary"
            >
              <span>{joinedOrg.orgRole === "teacher" ? "Перейти в школу" : "Открыть роадмап"}</span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
