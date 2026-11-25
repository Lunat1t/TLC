"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Check,
  ChevronRight,
  Cog,
  Crown,
  Leaf,
  Lock,
  Rocket,
  SlidersHorizontal,
  Sprout,
  Star,
  Wrench,
  X,
} from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { SubscriptionGate } from "@/components/billing/subscription-gate"
import { mapKits, tokenSkills } from "@/lib/map-kits"
import {
  computeKitRoadmapState,
  getRoadmapCardCoverUrl,
  isMissingRoadmapMigrationError,
  isRoadmapCardCompleted,
  isRoadmapKit,
  type RoadmapCard,
  type RoadmapKitId,
  type RoadmapTierSummary,
} from "@/lib/roadmap"
import { parseRoadmapStatePayload, type RoadmapStatePayload } from "@/lib/roadmap-client"
import { rankNames } from "@/lib/student-level"
import { createClient } from "@/utils/supabase/client"
import "./roadmap.css"

const RANK_BADGES = [
  { icon: Sprout, color: "#397337", bg: "#e5f2ce" },
  { icon: Leaf, color: "#2d2a24", bg: "#e8e1d1" },
  { icon: Wrench, color: "#bb241a", bg: "#f2eee4" },
  { icon: Cog, color: "#7044a9", bg: "#f2eee5" },
  { icon: Rocket, color: "#ac4721", bg: "#ffe6d4" },
  { icon: Star, color: "#ad3062", bg: "#ffe2ed" },
  { icon: Crown, color: "#805508", bg: "#ffe69b" },
] as const

function RankIcon({ index }: { index: number }) {
  const badge = RANK_BADGES[index] ?? RANK_BADGES[0]
  const Icon = badge.icon
  return (
    <span className="rm-rank-icon" style={{ color: badge.color, background: badge.bg }}>
      <Icon size={20} strokeWidth={2.5} aria-hidden="true" />
    </span>
  )
}

function skillShortLabel(id: (typeof tokenSkills)[number]["id"]): string {
  if (id === "mechanics") return "М"
  if (id === "logic") return "Л"
  return "Т"
}

export function RoadmapView({ initialKit }: { initialKit?: string }) {
  const router = useRouter()
  const { userId, role, canPublish, canAccessLearning, ready, error: accessError, refreshProfile } = useAccess()
  const [kit, setKitState] = useState<RoadmapKitId>(() =>
    isRoadmapKit(initialKit) ? initialKit : mapKits[0].id
  )
  const [payload, setPayload] = useState<RoadmapStatePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [migrationPending, setMigrationPending] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [subscriptionRequired, setSubscriptionRequired] = useState(false)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [soloAnswer, setSoloAnswer] = useState("")
  const [soloBusy, setSoloBusy] = useState(false)
  const [soloFeedback, setSoloFeedback] = useState<{ kind: "error" | "ok"; text: string } | null>(null)
  const ranksDialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (isRoadmapKit(initialKit)) {
      setKitState(initialKit)
    } else if (userId) {
      try {
        const saved = localStorage.getItem(`tlc:points-kit:${userId}`)
        if (isRoadmapKit(saved)) setKitState(saved)
      } catch { /* localStorage optional */ }
    }
  }, [initialKit, userId])

  const loadState = useCallback(async () => {
    if (!userId) return
    if (!canAccessLearning) {
      setSubscriptionRequired(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError("")
    setSubscriptionRequired(false)
    setMigrationPending(false)
    try {
      const { data, error } = await createClient().rpc("tlc_roadmap_state")
      if (error) {
        if (String(error.message || "").toLowerCase().includes("subscription_required")) {
          setSubscriptionRequired(true)
          return
        }
        if (isMissingRoadmapMigrationError(error)) {
          setMigrationPending(true)
          setPayload({
            role: null,
            isEditor: canPublish,
            canUseSoloCheck: false,
            isSchoolStudent: false,
            soloChecks: {},
            cards: [],
            progress: {},
            savedRanks: { ev3: 0, vex: 0, spike: 0 },
          })
          return
        }
        throw error
      }
      setPayload(parseRoadmapStatePayload(data))
    } catch {
      setLoadError("Не удалось загрузить роадмап. Попробуйте обновить страницу.")
    } finally {
      setLoading(false)
    }
  }, [canAccessLearning, canPublish, userId])

  useEffect(() => {
    if (!ready || !userId) return
    void loadState()
  }, [ready, userId, loadState])

  useEffect(() => {
    setSoloAnswer("")
    setSoloFeedback(null)
  }, [selectedCardId])

  useEffect(() => {
    if (!selectedCardId) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedCardId(null)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [selectedCardId])

  function selectKit(nextKit: RoadmapKitId) {
    setKitState(nextKit)
    setSelectedCardId(null)
    if (userId) {
      try {
        localStorage.setItem(`tlc:points-kit:${userId}`, nextKit)
      } catch { /* optional */ }
    }
    router.replace(`/map?kit=${nextKit}`, { scroll: false })
  }

  const state = useMemo(() => {
    const cards = payload?.cards ?? []
    const progress = payload?.progress ?? {}
    const savedRank = payload?.savedRanks[kit] ?? 0
    return computeKitRoadmapState(kit, cards, progress, savedRank)
  }, [kit, payload])

  const selectedEntry = useMemo<{ card: RoadmapCard; tier: RoadmapTierSummary } | null>(() => {
    if (!selectedCardId) return null
    for (const tier of state.tiers) {
      const card = tier.cards.find((item) => item.id === selectedCardId)
      if (card) return { card, tier }
    }
    return null
  }, [selectedCardId, state.tiers])

  const kitLabel = mapKits.find((item) => item.id === kit)?.label ?? kit
  const hasAnyCards = state.tiers.some((tier) => tier.cards.length > 0)
  const meterScale = Math.max(state.nextThreshold ?? 0, state.totalPoints, 1)

  const soloCheckSpec = selectedEntry ? payload?.soloChecks[selectedEntry.card.id] ?? null : null
  const showSoloCheck = Boolean(
    selectedEntry &&
      payload?.canUseSoloCheck &&
      !payload?.isSchoolStudent &&
      selectedEntry.tier.unlocked &&
      !isRoadmapCardCompleted(selectedEntry.card, payload?.progress[selectedEntry.card.id])
  )

  async function handleSoloCheckSubmit(answerValue: string) {
    if (!selectedEntry || soloBusy || !answerValue.trim()) return
    setSoloBusy(true)
    setSoloFeedback(null)
    try {
      const res = await fetch("/api/roadmap/solo-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId: selectedEntry.card.id,
          answer: answerValue.trim(),
        }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: { message?: string }
      }
      if (!res.ok || !json.ok) {
        setSoloFeedback({
          kind: "error",
          text: json.error?.message || "Не удалось подтвердить карточку.",
        })
        return
      }
      setSoloFeedback({ kind: "ok", text: "Карточка зачтена! Ранг и очки обновлены." })
      await loadState()
    } catch {
      setSoloFeedback({ kind: "error", text: "Ошибка сети. Попробуйте ещё раз." })
    } finally {
      setSoloBusy(false)
    }
  }

  if (!ready) {
    return (
      <main className="rm-page">
        <div className="rm-shell" style={{ paddingTop: 24 }}>
          <div className="rm-empty" role="status">Загружаем роадмап…</div>
        </div>
      </main>
    )
  }

  if (!userId) {
    return (
      <main className="rm-page">
        <div className="rm-shell" style={{ paddingTop: 24 }}>
          <div className="rm-empty">
            <p style={{ margin: 0 }}>Войдите в Brick Studio, чтобы открыть роадмап.</p>
            <Link href="/login?next=/map" className="rm-btn-primary">Войти</Link>
          </div>
        </div>
      </main>
    )
  }

  if (accessError) {
    return (
      <main className="rm-page">
        <div className="rm-shell" style={{ paddingTop: 24 }}>
          <div className="rm-empty" role="alert">
            <p>Не удалось проверить аккаунт.</p>
            <button type="button" className="rm-btn-primary" onClick={() => void refreshProfile()}>
              Повторить
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (subscriptionRequired || (!canAccessLearning && !loading && !migrationPending)) {
    return (
      <main className="rm-page">
        <SubscriptionGate
          userId={userId}
          nextPath="/map"
          canJoinSchool={role !== "parent"}
        />
      </main>
    )
  }

  return (
    <main className="rm-page">
      <header className="rm-sticky">
        <div className="rm-sticky-inner">
          <div className="rm-top-row">
            <nav className="rm-kits" aria-label="Выбор набора роботов">
              {mapKits.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="rm-kit-btn"
                  aria-pressed={kit === item.id}
                  onClick={() => selectKit(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="rm-actions">
              <button
                type="button"
                className="rm-btn-secondary"
                onClick={() => ranksDialog.current?.showModal()}
              >
                Все ранги
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {canPublish && (
                <Link href={`/teacher/roadmap?kit=${kit}`} className="rm-btn-primary">
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  Настроить карту
                </Link>
              )}
            </div>
          </div>

          <section className="rm-rank-bar" aria-label={`Прогресс по набору ${kitLabel}`}>
            <div className="rm-rank-summary">
              <div className="rm-rank-head">
                <div className="rm-rank-badge">
                  <RankIcon index={state.unlockedRank} />
                  <div className="rm-rank-title">
                    <small>{kitLabel} · {payload?.isEditor ? "Режим учителя" : "Текущий ранг"}</small>
                    <strong>{rankNames[state.unlockedRank]}</strong>
                  </div>
                </div>
                <div className="rm-rank-score">
                  {state.nextThreshold !== null && state.nextRankIndex !== null ? (
                    <span>
                      {state.totalPoints} / {state.nextThreshold} очк. · до {rankNames[state.nextRankIndex]}: {state.pointsToNext}
                    </span>
                  ) : state.unlockedRank === rankNames.length - 1 ? (
                    <span>{state.totalPoints} очк. · Максимальный ранг</span>
                  ) : (
                    <span>{state.totalPoints} очк. · Следующий ярус настраивается</span>
                  )}
                </div>
              </div>
              <div className="rm-meter" aria-hidden="true">
                {tokenSkills.map((skill) => {
                  const pts = state.skillPoints[skill.id]
                  const width = (pts / meterScale) * 100
                  return (
                    <span
                      key={skill.id}
                      className="rm-meter-seg"
                      style={{ width: `${width}%`, background: skill.color }}
                    />
                  )
                })}
              </div>
            </div>

            <div className="rm-skills-row" aria-label="Уровни навыков">
              {state.skillLevels.map((skill) => (
                <div key={skill.id} className="rm-skill-pill">
                  <span className="rm-skill-dot" style={{ background: skill.color }} aria-hidden="true" />
                  <span>{skill.label}</span>
                  <span>Ур. {skill.level}</span>
                  <small style={{ opacity: 0.7 }}>({skill.points})</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      </header>

      <div className="rm-shell">
        {migrationPending && (
          <div className="rm-banner" role="status">
            Таблица роадмапа ещё не развёрнута в базе данных (ожидается миграция <code>20261123120000_roadmap_cards.sql</code>).
          </div>
        )}

        {loadError && (
          <div className="rm-banner is-error" role="alert">
            {loadError}{" "}
            <button type="button" className="rm-btn-secondary" style={{ marginLeft: 8, minHeight: 34 }} onClick={() => void loadState()}>
              Повторить
            </button>
          </div>
        )}

        <div className={`rm-layout${selectedEntry ? " has-inspector" : ""}`}>
          <div className="rm-tiers">
            {loading ? (
              <div className="rm-empty" role="status">Загружаем карточки роботов…</div>
            ) : !hasAnyCards ? (
              <div className="rm-empty">
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Для набора {kitLabel} пока нет карточек</h2>
                <p style={{ margin: 0, opacity: 0.8 }}>
                  {canPublish
                    ? "Добавьте инструкции роботов в ранги Junior–King в панели учителя."
                    : "Скоро здесь появятся роботы и награды навыков."}
                </p>
                {canPublish && (
                  <Link href={`/teacher/roadmap?kit=${kit}`} className="rm-btn-primary">
                    Открыть конструктор карты
                  </Link>
                )}
              </div>
            ) : (
              state.tiers.map((tier) => {
                if (tier.cards.length === 0 && !canPublish) return null
                if (tier.cards.length === 0) return null
                const tierLocked = !tier.unlocked && !payload?.isEditor
                return (
                  <section
                    key={tier.rankIndex}
                    className={`rm-tier${tier.current ? " is-current" : ""}${tierLocked ? " is-locked" : ""}`}
                    aria-label={`Ярус ${tier.numeral} — ${tier.rankName}`}
                  >
                    <div className="rm-tier-head">
                      <div className="rm-tier-title">
                        <span className="rm-tier-num">{tier.numeral}</span>
                        <h2>{tier.rankName}</h2>
                      </div>
                      <div className="rm-tier-meta">
                        {tier.unlocked || payload?.isEditor ? (
                          <span>
                            Открыт{tier.rankIndex > 0 ? ` · от ${tier.threshold} очк.` : " · старт"}
                          </span>
                        ) : tier.pointsNeeded !== null ? (
                          <span>
                            Закрыт · нужно {tier.threshold} очк. (ещё {tier.pointsNeeded})
                          </span>
                        ) : (
                          <span>Закрыт · заполните предыдущий ярус</span>
                        )}
                      </div>
                    </div>

                    <div className="rm-cards-grid">
                      {tier.cards.map((card) => {
                        const cardProgress = payload?.progress[card.id]
                        const completed = isRoadmapCardCompleted(card, cardProgress)
                        const coverUrl = getRoadmapCardCoverUrl(card)
                        const selected = selectedCardId === card.id
                        const locked = tierLocked
                        return (
                          <button
                            key={card.id}
                            type="button"
                            className={`rm-card${completed ? " is-completed" : ""}${locked ? " is-locked" : ""}${selected ? " is-selected" : ""}`}
                            onClick={() => setSelectedCardId(selected ? null : card.id)}
                            aria-pressed={selected}
                          >
                            <div className="rm-card-top">
                              <span className="rm-card-status">
                                {locked ? (
                                  <>
                                    <Lock size={11} aria-hidden="true" />
                                    Нужен {tier.rankName}
                                  </>
                                ) : completed ? (
                                  <>
                                    <Check size={11} aria-hidden="true" />
                                    Пройден
                                  </>
                                ) : (
                                  "Доступен"
                                )}
                              </span>
                            </div>

                            <div className="rm-card-cover">
                              {coverUrl ? (
                                <img src={coverUrl} alt="" loading="lazy" decoding="async" />
                              ) : (
                                <Wrench size={32} aria-hidden="true" />
                              )}
                            </div>

                            <h3 className="rm-card-name">{card.title}</h3>

                            <div className="rm-card-chips">
                              {tokenSkills.map((skill) => {
                                const pts =
                                  skill.id === "mechanics"
                                    ? card.mechanicsPoints
                                    : skill.id === "logic"
                                      ? card.logicPoints
                                      : card.creativityPoints
                                if (pts <= 0) return null
                                const done =
                                  skill.id === "mechanics"
                                    ? cardProgress?.mechanicsDone
                                    : skill.id === "logic"
                                      ? cardProgress?.logicDone
                                      : cardProgress?.creativityDone
                                return (
                                  <span
                                    key={skill.id}
                                    className={`rm-chip${done ? " is-done" : ""}`}
                                    style={{ background: skill.color }}
                                  >
                                    +{pts} {skillShortLabel(skill.id)}
                                    {done && <Check size={10} aria-hidden="true" />}
                                  </span>
                                )
                              })}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })
            )}
          </div>

          {selectedEntry && (
            <div
              className="rm-inspector-backdrop"
              onClick={(event) => {
                if (event.target === event.currentTarget) setSelectedCardId(null)
              }}
            >
              <aside className="rm-inspector" aria-label={`Детали карточки ${selectedEntry.card.title}`}>
                <div className="rm-inspector-head">
                  <div>
                    <small style={{ fontWeight: 800, opacity: 0.7 }}>
                      {selectedEntry.tier.numeral} · {selectedEntry.tier.rankName}
                    </small>
                    <h2 style={{ margin: "2px 0 0", fontSize: 20, fontWeight: 900 }}>
                      {selectedEntry.card.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="rm-inspector-close"
                    aria-label="Закрыть детали карточки"
                    onClick={() => setSelectedCardId(null)}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="rm-inspector-cover">
                  {getRoadmapCardCoverUrl(selectedEntry.card) ? (
                    <img src={getRoadmapCardCoverUrl(selectedEntry.card)!} alt="" />
                  ) : (
                    <Wrench size={38} aria-hidden="true" />
                  )}
                </div>

                {selectedEntry.card.summary && (
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, opacity: 0.85 }}>
                    {selectedEntry.card.summary}
                  </p>
                )}

                <div>
                  <strong style={{ display: "block", fontSize: 12, marginBottom: 8 }}>
                    Награды карточки (подтверждает учитель):
                  </strong>
                  <ul className="rm-steps-list">
                    {tokenSkills.map((skill) => {
                      const pts =
                        skill.id === "mechanics"
                          ? selectedEntry.card.mechanicsPoints
                          : skill.id === "logic"
                            ? selectedEntry.card.logicPoints
                            : selectedEntry.card.creativityPoints
                      if (pts <= 0) return null
                      const p = payload?.progress[selectedEntry.card.id]
                      const done =
                        skill.id === "mechanics"
                          ? p?.mechanicsDone
                          : skill.id === "logic"
                            ? p?.logicDone
                            : p?.creativityDone
                      const stepTitle =
                        skill.id === "mechanics"
                          ? "Сборка (Механика)"
                          : skill.id === "logic"
                            ? "Код (Логика)"
                            : "Доработка (Творчество)"
                      return (
                        <li key={skill.id} className={`rm-step-row${done ? " is-done" : ""}`}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span className="rm-skill-dot" style={{ background: skill.color }} aria-hidden="true" />
                            {stepTitle}
                          </span>
                          <span>{done ? `Зачтено (+${pts})` : `+${pts} очк.`}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {!selectedEntry.tier.unlocked && !payload?.isEditor ? (
                  <div className="rm-banner" style={{ marginTop: 0 }}>
                    Инструкция откроется на ранге <strong>{selectedEntry.tier.rankName}</strong>
                    {selectedEntry.tier.pointsNeeded !== null
                      ? ` (осталось ${selectedEntry.tier.pointsNeeded} очк.)`
                      : " (сначала заполните и пройдите предыдущие ярусы)."}
                  </div>
                ) : selectedEntry.card.instructionSlug ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <Link
                      href={`/instructions/${encodeURIComponent(selectedEntry.card.instructionSlug)}`}
                      className="rm-btn-primary"
                      style={{ flex: "1 1 auto" }}
                    >
                      Открыть инструкцию
                    </Link>
                    {selectedEntry.card.hasPdf && (
                      <Link
                        href={`/instructions/${encodeURIComponent(selectedEntry.card.instructionSlug)}/read`}
                        className="rm-btn-secondary"
                      >
                        Читать PDF
                      </Link>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 13, opacity: 0.75 }}>
                    Инструкция ещё не привязана к этой карточке.
                  </p>
                )}

                {showSoloCheck && (
                  <section className="rm-solo-check" aria-label="Самопроверка Solo">
                    <strong style={{ fontSize: 13, display: "block" }}>
                      Самопроверка (Solo)
                    </strong>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45, opacity: 0.9 }}>
                      {soloCheckSpec
                        ? soloCheckSpec.question
                        : "Выберите набор робототехники этой карточки для зачёта:"}
                    </p>
                    {soloCheckSpec && soloCheckSpec.options.length === 0 ? (
                      <div style={{ display: "grid", gap: 8 }}>
                        <input
                          type="text"
                          className="rm-input"
                          placeholder="Введите ответ"
                          value={soloAnswer}
                          onChange={(e) => setSoloAnswer(e.target.value)}
                        />
                        <button
                          type="button"
                          className="rm-btn-primary"
                          disabled={soloBusy || !soloAnswer.trim()}
                          onClick={() => void handleSoloCheckSubmit(soloAnswer)}
                        >
                          {soloBusy ? "Проверяем…" : "Проверить ответ"}
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        <div className="rm-solo-options">
                          {(soloCheckSpec?.options.length
                            ? soloCheckSpec.options.map((opt) => ({ value: opt, label: opt }))
                            : mapKits.map((k) => ({ value: k.id, label: k.label }))
                          ).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              className={soloAnswer === opt.value ? "rm-btn-primary" : "rm-btn-secondary"}
                              style={{ minHeight: 44 }}
                              disabled={soloBusy}
                              onClick={() => setSoloAnswer(opt.value)}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="rm-btn-primary"
                          disabled={soloBusy || !soloAnswer}
                          onClick={() => void handleSoloCheckSubmit(soloAnswer)}
                        >
                          {soloBusy ? "Проверяем…" : "Зачесть карточку"}
                        </button>
                      </div>
                    )}
                    {soloFeedback && (
                      <p
                        role={soloFeedback.kind === "error" ? "alert" : "status"}
                        className="rm-banner"
                        style={{
                          margin: 0,
                          color: soloFeedback.kind === "error" ? "#be123c" : "#15803d",
                        }}
                      >
                        {soloFeedback.text}
                      </p>
                    )}
                  </section>
                )}
              </aside>
            </div>
          )}
        </div>
      </div>

      <dialog ref={ranksDialog} className="rm-dialog" aria-label="Все ранги набора">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
          <strong style={{ fontSize: 18 }}>Ранги · {kitLabel}</strong>
          <button
            type="button"
            className="rm-inspector-close"
            aria-label="Закрыть список рангов"
            onClick={() => ranksDialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
          {state.tiers.map((tier) => (
            <li
              key={tier.rankIndex}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 12,
                border: tier.current ? "1.5px solid #e02c1f" : "1px solid #ede7da",
              }}
            >
              <RankIcon index={tier.rankIndex} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>{tier.numeral} · {tier.rankName}</strong>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  {tier.cards.length === 0
                    ? "Карточки пока не добавлены"
                    : `Карточек: ${tier.cards.length} · Порог: ${tier.threshold} очк.`}
                </div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800 }}>
                {tier.current ? "Текущий" : tier.unlocked ? "Открыт" : "Закрыт"}
              </span>
            </li>
          ))}
        </ol>
      </dialog>
    </main>
  )
}
