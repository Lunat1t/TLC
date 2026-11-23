"use client"

import Link from "next/link"
import { KeyRound, Lock, Sparkles } from "lucide-react"
import "./billing.css"

export function SubscriptionGate({
  title = "Нужна подписка или код школы",
  description = "Роадмап и библиотека инструкций доступны по подписке Solo / School или по коду приглашения от вашей школы.",
  userId,
  nextPath = "/map",
  canJoinSchool = true,
}: {
  title?: string
  description?: string
  userId?: string | null
  nextPath?: string
  canJoinSchool?: boolean
}) {
  return (
    <div className="bs-gate-wrap">
      <section className="bs-card" aria-label={title}>
        <p className="bs-eyebrow">Доступ к обучению</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Lock size={22} aria-hidden="true" />
          <h1 className="bs-title">{title}</h1>
        </div>
        <p className="bs-muted">{description}</p>

        <div className="bs-actions-row">
          <Link href="/billing" className="bs-btn-primary">
            <Sparkles size={17} aria-hidden="true" />
            <span>Выбрать тариф</span>
          </Link>

          {canJoinSchool && (
            <Link href="/join" className="bs-btn-secondary">
              <KeyRound size={17} aria-hidden="true" />
              <span>Ввести код школы</span>
            </Link>
          )}

          {!userId && (
            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}`}
              className="bs-btn-secondary"
            >
              Войти в аккаунт
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}
