"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Check, CreditCard, KeyRound, School, Sparkles } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { BILLING_PLANS, formatKzt, type PlanId } from "@/lib/billing/plans"
import type { EffectiveEntitlements } from "@/lib/billing/entitlements"
import "./billing.css"

declare global {
  interface Window {
    cp?: {
      CloudPayments: new (opts?: { language?: string }) => {
        pay: (
          mode: "charge" | "auth",
          options: Record<string, unknown>,
          callbacks: {
            onSuccess?: () => void
            onFail?: (reason: unknown) => void
            onComplete?: (paymentResult: unknown) => void
          }
        ) => void
      }
    }
  }
}

type CheckoutStatus = {
  cloudPaymentsReady: boolean
  testModeReady: boolean
  provider: "cloudpayments_kz" | "test" | "unconfigured"
}

function loadCloudPaymentsScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"))
  if (window.cp?.CloudPayments) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cp-widget="true"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("cp_script_error")), { once: true })
      return
    }
    const script = document.createElement("script")
    script.src = "https://widget.cloudpayments.ru/bundles/cloudpayments.js"
    script.async = true
    script.dataset.cpWidget = "true"
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("cp_script_error"))
    document.head.appendChild(script)
  })
}

function formatDateRu(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function BillingPageClient() {
  const access = useAccess()
  const [serverEntitlements, setServerEntitlements] = useState<EffectiveEntitlements | null>(null)
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus | null>(null)
  const [orgName, setOrgName] = useState("")
  const [busyPlan, setBusyPlan] = useState<PlanId | null>(null)
  const [feedback, setFeedback] = useState<{ kind: "error" | "ok" | "info"; text: string } | null>(null)

  const refreshState = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/entitlements", { cache: "no-store" })
      if (!res.ok) return
      const payload = (await res.json()) as {
        entitlements?: EffectiveEntitlements
        checkout?: CheckoutStatus
      }
      if (payload.entitlements) setServerEntitlements(payload.entitlements)
      if (payload.checkout) setCheckoutStatus(payload.checkout)
    } catch {
      /* ignore transient fetch failure */
    }
  }, [])

  useEffect(() => {
    void refreshState()
  }, [refreshState, access.userId])

  const ent = serverEntitlements ?? access.entitlements
  const periodLabel = formatDateRu(ent.currentPeriodEnd)
  const activePlanObj = BILLING_PLANS.find((p) => p.id === ent.plan)

  async function handleCheckout(planId: PlanId) {
    if (busyPlan) return
    setBusyPlan(planId)
    setFeedback(null)

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, orgName: orgName.trim() || undefined }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        mode?: "cloudpayments_kz" | "test"
        widget?: Record<string, unknown>
        error?: { message?: string }
      }

      if (!res.ok) {
        setFeedback({
          kind: "error",
          text: payload.error?.message || "Не удалось начать оформление подписки.",
        })
        return
      }

      if (payload.mode === "test") {
        const testRes = await fetch("/api/billing/test-activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, orgName: orgName.trim() || undefined }),
        })
        const testJson = (await testRes.json().catch(() => ({}))) as {
          ok?: boolean
          error?: { message?: string }
        }
        if (!testRes.ok || !testJson.ok) {
          setFeedback({
            kind: "error",
            text: testJson.error?.message || "Не удалось активировать тестовый тариф.",
          })
          return
        }
        await Promise.all([access.refreshEntitlements(), refreshState()])
        setFeedback({
          kind: "ok",
          text: "Тестовая подписка активирована на 30 дней.",
        })
        return
      }

      if (payload.mode === "cloudpayments_kz" && payload.widget) {
        await loadCloudPaymentsScript()
        if (!window.cp?.CloudPayments) {
          throw new Error("cp_unavailable")
        }
        const widget = new window.cp.CloudPayments({ language: "ru-RU" })
        widget.pay("charge", payload.widget, {
          onSuccess: async () => {
            setFeedback({
              kind: "info",
              text: "Оплата принята, обновляем статус подписки…",
            })
            await Promise.all([access.refreshEntitlements(), refreshState()])
            setFeedback({
              kind: "ok",
              text: "Оплата прошла успешно. Доступ открыт!",
            })
          },
          onFail: () => {
            setFeedback({
              kind: "error",
              text: "Оплата не была завершена.",
            })
          },
        })
      }
    } catch {
      setFeedback({
        kind: "error",
        text: "Не удалось открыть платёжную форму. Попробуйте ещё раз.",
      })
    } finally {
      setBusyPlan(null)
    }
  }

  return (
    <main className="bs-billing-page">
      <section className="bs-card">
        <p className="bs-eyebrow">Тарифы Brick Studio · KZT</p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div>
            <h1 className="bs-title">Подписка для учеников и школ</h1>
            <p className="bs-muted" style={{ marginTop: 6 }}>
              Рабочий стол и редактор программ всегда открыты. Подписка или код школы открывают роадмап, PDF-инструкции и классы.
            </p>
          </div>

          <div
            className={`bs-status-pill${
              ent.canAccessLearning ? " is-active" : ent.status === "past_due" ? " is-warn" : ""
            }`}
          >
            <span>
              {ent.isAdmin
                ? "Администратор"
                : ent.canAccessLearning && activePlanObj
                  ? `Активен: ${activePlanObj.name}`
                  : ent.status === "past_due"
                    ? "Требуется продление"
                    : "Подписка не активна"}
            </span>
            {periodLabel && <span>· до {periodLabel}</span>}
          </div>
        </div>

        {ent.orgName && (
          <p className="bs-muted">
            Организация: <strong>{ent.orgName}</strong>
            {ent.groupName ? ` · группа «${ent.groupName}»` : ""}
          </p>
        )}

        <div className="bs-actions-row">
          <Link href="/join" className="bs-btn-secondary">
            <KeyRound size={17} aria-hidden="true" />
            <span>У меня есть код школы</span>
          </Link>
          {ent.canManageSchool && (
            <Link href="/teacher/school" className="bs-btn-secondary">
              <School size={17} aria-hidden="true" />
              <span>Школа и коды</span>
            </Link>
          )}
          {ent.canAccessLearning && (
            <Link href="/map" className="bs-btn-primary">
              <Sparkles size={17} aria-hidden="true" />
              <span>Открыть роадмап</span>
            </Link>
          )}
        </div>

        {checkoutStatus?.provider === "test" && (
          <p className="bs-alert is-info">
            Включён тестовый режим биллинга: кнопка оплаты активирует подписку на 30 дней без списания средств.
          </p>
        )}
        {checkoutStatus?.provider === "unconfigured" && (
          <p className="bs-alert is-info">
            Онлайн-оплата CloudPayments KZ пока не настроена на этом сервере. Можно подключиться по коду школы.
          </p>
        )}
      </section>

      {access.userId && (access.role === "teacher" || access.isAdmin) && (
        <section className="bs-card">
          <div className="bs-field">
            <label htmlFor="billing-org-name">
              Название школы или кружка (необязательно — для тарифов School Mini / Pro)
            </label>
            <input
              id="billing-org-name"
              type="text"
              maxLength={120}
              className="bs-input"
              placeholder="Например: Робототехника Астана"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
        </section>
      )}

      {feedback && (
        <p role={feedback.kind === "error" ? "alert" : "status"} className={`bs-alert ${feedback.kind === "error" ? "is-error" : feedback.kind === "ok" ? "is-success" : "is-info"}`}>
          {feedback.text}
        </p>
      )}

      <section className="bs-plans-grid" aria-label="Доступные тарифы">
        {BILLING_PLANS.map((plan) => {
          const isCurrent = ent.canAccessLearning && ent.plan === plan.id
          const teacherBlockedSolo = access.role === "teacher" && plan.id === "solo"
          const studentBlockedSchool = access.role === "student" && plan.subjectType === "org"
          const parentBlocked = access.role === "parent"
          const checkoutDisabled =
            Boolean(busyPlan) ||
            teacherBlockedSolo ||
            studentBlockedSchool ||
            parentBlocked ||
            checkoutStatus?.provider === "unconfigured"

          return (
            <article
              key={plan.id}
              className={`bs-card bs-plan-card${plan.id === "school_mini" ? " is-featured" : ""}`}
            >
              <div>
                <span className="bs-status-pill">{plan.badge}</span>
                <h2 className="bs-title" style={{ marginTop: 10 }}>
                  {plan.name}
                </h2>
                <p className="bs-muted" style={{ marginTop: 4 }}>
                  {plan.tagline}
                </p>
              </div>

              <div className="bs-plan-price">
                <strong>{formatKzt(plan.amountKzt)}</strong>
                <span className="bs-muted">{plan.periodLabel}</span>
              </div>

              <ul className="bs-plan-features">
                {plan.features.map((feat) => (
                  <li key={feat}>
                    <Check size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <div>
                {!access.userId ? (
                  <Link href="/login?next=/billing" className="bs-btn-primary" style={{ width: "100%" }}>
                    Войти и оформить
                  </Link>
                ) : teacherBlockedSolo ? (
                  <p className="bs-muted" style={{ fontSize: 12.5 }}>
                    Для аккаунта учителя доступны школьные тарифы.
                  </p>
                ) : studentBlockedSchool ? (
                  <p className="bs-muted" style={{ fontSize: 12.5 }}>
                    Для аккаунта учителя. Ученик может подключиться по коду школы.
                  </p>
                ) : parentBlocked ? (
                  <p className="bs-muted" style={{ fontSize: 12.5 }}>
                    Доступно для аккаунта ученика или учителя.
                  </p>
                ) : (
                  <button
                    type="button"
                    className={isCurrent ? "bs-btn-secondary" : "bs-btn-primary"}
                    style={{ width: "100%" }}
                    disabled={checkoutDisabled}
                    onClick={() => void handleCheckout(plan.id)}
                  >
                    <CreditCard size={17} aria-hidden="true" />
                    <span>
                      {busyPlan === plan.id
                        ? "Открываем оплату…"
                        : isCurrent
                          ? "Продлить тариф"
                          : checkoutStatus?.provider === "test"
                            ? "Активировать (тест)"
                            : `Оплатить ${formatKzt(plan.amountKzt)}`}
                    </span>
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
