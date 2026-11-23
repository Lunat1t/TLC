"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Map as MapIcon,
  Plus,
  Search,
  Trash2,
  Wrench,
} from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { SubscriptionGate } from "@/components/billing/subscription-gate"
import { mapKits, tokenSkills } from "@/lib/map-kits"
import {
  computeKitRoadmapState,
  getRoadmapCardCoverUrl,
  isMissingRoadmapMigrationError,
  isRoadmapKit,
  ROADMAP_TIER_NUMERALS,
  type RoadmapCard,
  type RoadmapCardProgress,
  type RoadmapKitId,
} from "@/lib/roadmap"
import {
  mapRpcCard,
  mapRpcInstruction,
  mapRpcProgress,
  mapRpcSavedRanks,
  type RoadmapInstructionOption,
} from "@/lib/roadmap-client"
import { rankNames } from "@/lib/student-level"
import { createClient } from "@/utils/supabase/client"
import "./roadmap.css"

type StudentSummary = { student_id: string; nickname: string; login: string }
type CardDraft = { mechanics: number; logic: number; creativity: number; rankIndex: number }

export function TeacherRoadmapAdmin({ initialKit }: { initialKit?: string }) {
  const router = useRouter()
  const { ready, userId, role, isAdmin, canManageSchool, error: accessError, refreshProfile } = useAccess()
  const allowed = Boolean(userId && (role === "teacher" || isAdmin))

  const [kit, setKit] = useState<RoadmapKitId>(() =>
    isRoadmapKit(initialKit) ? initialKit : mapKits[0].id
  )
  const [tab, setTab] = useState<"builder" | "progress">("builder")
  const [cards, setCards] = useState<RoadmapCard[]>([])
  const [instructions, setInstructions] = useState<RoadmapInstructionOption[]>([])
  const [drafts, setDrafts] = useState<Record<string, CardDraft>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  const [subscriptionRequired, setSubscriptionRequired] = useState(false)
  const [banner, setBanner] = useState<{ kind: "error" | "ok"; text: string } | null>(null)

  const [searchTerm, setSearchTerm] = useState("")
  const [onlyCurrentKit, setOnlyCurrentKit] = useState(true)
  const [addRank, setAddRank] = useState(0)
  const [addMech, setAddMech] = useState(1)
  const [addLogic, setAddLogic] = useState(0)
  const [addCreat, setAddCreat] = useState(0)
  const [dragCardId, setDragCardId] = useState<string | null>(null)

  const [studentQuery, setStudentQuery] = useState("")
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [selectedStudent, setSelectedStudent] = useState<StudentSummary | null>(null)
  const [studentProgress, setStudentProgress] = useState<Record<string, RoadmapCardProgress>>({})
  const [studentSavedRanks, setStudentSavedRanks] = useState<Record<RoadmapKitId, number>>({
    ev3: 0,
    vex: 0,
    spike: 0,
  })

  useEffect(() => {
    if (!ready || allowed || accessError) return
    router.replace(userId ? "/dashboard" : "/login?next=/teacher/roadmap")
  }, [accessError, allowed, ready, router, userId])

  const loadCatalog = useCallback(async () => {
    if (!canManageSchool && !isAdmin) {
      setSubscriptionRequired(true)
      setLoading(false)
      return
    }
    setLoading(true)
    setSubscriptionRequired(false)
    setMigrationPending(false)
    try {
      const { data, error } = await createClient().rpc("tlc_roadmap_admin_catalog")
      if (error) {
        if (String(error.message || "").toLowerCase().includes("subscription")) {
          setSubscriptionRequired(true)
          return
        }
        if (isMissingRoadmapMigrationError(error)) {
          setMigrationPending(true)
          return
        }
        throw error
      }
      const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>
      const loadedCards = Array.isArray(obj.cards)
        ? obj.cards.map(mapRpcCard).filter((c): c is RoadmapCard => c !== null)
        : []
      const loadedInstructions = Array.isArray(obj.instructions)
        ? obj.instructions
            .map(mapRpcInstruction)
            .filter((item): item is RoadmapInstructionOption => item !== null)
        : []
      setCards(loadedCards)
      setInstructions(loadedInstructions)
      const nextDrafts: Record<string, CardDraft> = {}
      for (const c of loadedCards) {
        nextDrafts[c.id] = {
          mechanics: c.mechanicsPoints,
          logic: c.logicPoints,
          creativity: c.creativityPoints,
          rankIndex: c.rankIndex,
        }
      }
      setDrafts(nextDrafts)
    } catch {
      setBanner({ kind: "error", text: "Не удалось загрузить каталог конструктора роадмапа." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready && allowed) void loadCatalog()
  }, [allowed, canManageSchool, loadCatalog, ready])

  const roadmapState = useMemo(
    () => computeKitRoadmapState(kit, cards, studentProgress, studentSavedRanks[kit] ?? 0),
    [cards, kit, studentProgress, studentSavedRanks]
  )

  const placedByInstruction = useMemo(() => {
    const map = new Map<string, RoadmapCard>()
    for (const card of cards) {
      if (card.kit === kit && card.instructionId) {
        map.set(card.instructionId, card)
      }
    }
    return map
  }, [cards, kit])

  const filteredInstructions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return instructions.filter((item) => {
      if (onlyCurrentKit && kit !== "vex" && item.kit !== kit) return false
      if (!q) return true
      return item.title.toLowerCase().includes(q) || item.slug.toLowerCase().includes(q)
    })
  }, [instructions, kit, onlyCurrentKit, searchTerm])

  async function addInstructionToMap(inst: RoadmapInstructionOption) {
    if (addMech + addLogic + addCreat < 1) {
      setBanner({ kind: "error", text: "Укажите хотя бы 1 очко награды на карточку." })
      return
    }
    setBusy(true)
    setBanner(null)
    try {
      const { error } = await createClient().rpc("tlc_roadmap_upsert_card", {
        p_card_id: null,
        p_kit: kit,
        p_rank_index: addRank,
        p_instruction_id: inst.id,
        p_title: "",
        p_mechanics_points: addMech,
        p_logic_points: addLogic,
        p_creativity_points: addCreat,
      })
      if (error) throw error
      setBanner({ kind: "ok", text: `Карточка «${inst.title}» добавлена в ранг ${rankNames[addRank]}.` })
      await loadCatalog()
    } catch (err) {
      setBanner({
        kind: "error",
        text: err instanceof Error ? err.message : "Не удалось добавить карточку.",
      })
    } finally {
      setBusy(false)
    }
  }

  async function saveCardDraft(card: RoadmapCard) {
    const draft = drafts[card.id]
    if (!draft) return
    if (draft.mechanics + draft.logic + draft.creativity < 1) {
      setBanner({ kind: "error", text: "Сумма наград карточки должна быть не меньше 1." })
      return
    }
    setBusy(true)
    setBanner(null)
    try {
      const { error } = await createClient().rpc("tlc_roadmap_upsert_card", {
        p_card_id: card.id,
        p_kit: card.kit,
        p_rank_index: draft.rankIndex,
        p_instruction_id: card.instructionId,
        p_title: card.title.slice(0, 160),
        p_mechanics_points: draft.mechanics,
        p_logic_points: draft.logic,
        p_creativity_points: draft.creativity,
      })
      if (error) throw error
      setBanner({ kind: "ok", text: `Карточка «${card.title}» обновлена.` })
      await loadCatalog()
    } catch {
      setBanner({ kind: "error", text: "Не удалось обновить карточку." })
    } finally {
      setBusy(false)
    }
  }

  async function reorderCards(rankIndex: number, nextOrderIds: string[]) {
    setBusy(true)
    setBanner(null)
    try {
      const { error } = await createClient().rpc("tlc_roadmap_reorder_rank", {
        p_kit: kit,
        p_rank_index: rankIndex,
        p_card_ids: nextOrderIds,
      })
      if (error) throw error
      await loadCatalog()
    } catch {
      setBanner({ kind: "error", text: "Не удалось изменить порядок карточек." })
    } finally {
      setBusy(false)
    }
  }

  async function moveCard(rankIndex: number, tierCards: RoadmapCard[], index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= tierCards.length) return
    const next = [...tierCards]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    await reorderCards(rankIndex, next.map((c) => c.id))
  }

  async function dropCardOnto(rankIndex: number, tierCards: RoadmapCard[], targetCardId: string) {
    if (!dragCardId || dragCardId === targetCardId) return
    const fromIdx = tierCards.findIndex((c) => c.id === dragCardId)
    const toIdx = tierCards.findIndex((c) => c.id === targetCardId)
    setDragCardId(null)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...tierCards]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    await reorderCards(rankIndex, next.map((c) => c.id))
  }

  async function removeCard(card: RoadmapCard) {
    setBusy(true)
    setBanner(null)
    try {
      const { error } = await createClient().rpc("tlc_roadmap_delete_card", { p_card_id: card.id })
      if (error) throw error
      setBanner({ kind: "ok", text: `Карточка «${card.title}» убрана с карты.` })
      await loadCatalog()
    } catch {
      setBanner({ kind: "error", text: "Не удалось удалить карточку." })
    } finally {
      setBusy(false)
    }
  }

  async function searchStudents(event: FormEvent) {
    event.preventDefault()
    if (studentQuery.trim().length < 2) return
    setBusy(true)
    setBanner(null)
    try {
      const { data, error } = await createClient().rpc("tlc_roadmap_search_students", {
        p_query: studentQuery.trim(),
      })
      if (error) throw error
      setStudents(Array.isArray(data) ? (data as StudentSummary[]) : [])
    } catch {
      setBanner({ kind: "error", text: "Не удалось найти учеников." })
    } finally {
      setBusy(false)
    }
  }

  async function loadStudentProgress(student: StudentSummary) {
    setSelectedStudent(student)
    setBusy(true)
    setBanner(null)
    try {
      const { data, error } = await createClient().rpc("tlc_roadmap_student_progress", {
        p_student_id: student.student_id,
      })
      if (error) throw error
      const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>
      setStudentProgress(mapRpcProgress(obj.progress))
      setStudentSavedRanks(mapRpcSavedRanks(obj.saved_ranks))
    } catch {
      setBanner({ kind: "error", text: "Не удалось загрузить прогресс ученика." })
    } finally {
      setBusy(false)
    }
  }

  async function toggleStudentSkill(
    card: RoadmapCard,
    skill: "mechanics" | "logic" | "creativity" | "all",
    done: boolean
  ) {
    if (!selectedStudent) return
    setBusy(true)
    setBanner(null)
    try {
      const { error } = await createClient().rpc("tlc_roadmap_set_student_skill", {
        p_student_id: selectedStudent.student_id,
        p_card_id: card.id,
        p_skill: skill,
        p_done: done,
      })
      if (error) throw error
      await loadStudentProgress(selectedStudent)
    } catch {
      setBanner({ kind: "error", text: "Не удалось сохранить отметку ученика." })
    } finally {
      setBusy(false)
    }
  }

  if (!ready || (!allowed && !accessError)) {
    return (
      <main className="rm-page">
        <div className="rm-shell" style={{ paddingTop: 24 }}>
          <div className="rm-empty" role="status">Проверяем доступ…</div>
        </div>
      </main>
    )
  }

  if (accessError) {
    return (
      <main className="rm-page">
        <div className="rm-shell" style={{ paddingTop: 24 }}>
          <div className="rm-empty" role="alert">
            <p>Не удалось проверить доступ.</p>
            <button type="button" className="rm-btn-primary" onClick={() => void refreshProfile()}>
              Повторить
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (subscriptionRequired || (!canManageSchool && !isAdmin && !loading && !migrationPending)) {
    return (
      <main className="rm-page">
        <SubscriptionGate
          title="Настройка роадмапа и журнал класса"
          description="Управление роадмапом, карточками и прогрессом учеников доступно по подписке School Mini или School Pro."
          userId={userId}
          nextPath="/teacher/roadmap"
        />
      </main>
    )
  }

  const kitLabel = mapKits.find((item) => item.id === kit)?.label ?? kit

  return (
    <main className="rm-page">
      <header className="rm-sticky">
        <div className="rm-sticky-inner">
          <div className="rm-top-row">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Конструктор роадмапа</h1>
              <nav className="rm-kits" aria-label="Набор конструктора">
                {mapKits.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="rm-kit-btn"
                    aria-pressed={kit === item.id}
                    onClick={() => setKit(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="rm-actions">
              <button
                type="button"
                className={tab === "builder" ? "rm-btn-primary" : "rm-btn-secondary"}
                onClick={() => setTab("builder")}
              >
                Карта и порядок
              </button>
              <button
                type="button"
                className={tab === "progress" ? "rm-btn-primary" : "rm-btn-secondary"}
                onClick={() => setTab("progress")}
              >
                Зачёт ученику
              </button>
              <Link href={`/map?kit=${kit}`} className="rm-btn-secondary">
                <MapIcon size={16} aria-hidden="true" />
                Открыть /map
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="rm-shell">
        {migrationPending && (
          <div className="rm-banner" role="status">
            Примените миграцию <code>supabase/migrations/20261123120000_roadmap_cards.sql</code> для сохранения карты.
          </div>
        )}

        {banner && (
          <div className={`rm-banner ${banner.kind === "error" ? "is-error" : "is-ok"}`} role="status">
            {banner.text}
          </div>
        )}

        {loading ? (
          <div className="rm-empty" style={{ marginTop: 20 }} role="status">Загружаем конструктор…</div>
        ) : tab === "builder" ? (
          <div className="rm-admin-grid">
            <div className="rm-admin-tiers">
              {roadmapState.tiers.map((tier) => (
                <section key={tier.rankIndex} className="rm-admin-tier" aria-label={`Ранг ${tier.rankName}`}>
                  <div className="rm-tier-head">
                    <div className="rm-tier-title">
                      <span className="rm-tier-num">{ROADMAP_TIER_NUMERALS[tier.rankIndex]}</span>
                      <h2>{tier.rankName}</h2>
                    </div>
                    <div className="rm-tier-meta">
                      Авторасчёт · Наград: {tier.tierTotal} очк. · Переход (70%): {tier.stepCost} очк.
                      {tier.rankIndex > 0 ? ` · Открывается с ${tier.threshold} очк.` : " · Старт"}
                    </div>
                  </div>

                  {tier.cards.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                      В этом ранге пока нет карточек — добавьте инструкцию из списка справа.
                    </p>
                  ) : (
                    tier.cards.map((card, index) => {
                      const draft = drafts[card.id] ?? {
                        mechanics: card.mechanicsPoints,
                        logic: card.logicPoints,
                        creativity: card.creativityPoints,
                        rankIndex: card.rankIndex,
                      }
                      const dirty =
                        draft.mechanics !== card.mechanicsPoints ||
                        draft.logic !== card.logicPoints ||
                        draft.creativity !== card.creativityPoints ||
                        draft.rankIndex !== card.rankIndex
                      const coverUrl = getRoadmapCardCoverUrl(card)
                      return (
                        <article
                          key={card.id}
                          className="rm-admin-card-row"
                          draggable={!busy}
                          onDragStart={() => setDragCardId(card.id)}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => void dropCardOnto(tier.rankIndex, tier.cards, card.id)}
                        >
                          <div className="rm-admin-thumb">
                            {coverUrl ? <img src={coverUrl} alt="" /> : <Wrench size={18} aria-hidden="true" />}
                          </div>

                          <div style={{ minWidth: 0, display: "grid", gap: 6 }}>
                            <strong style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 5 }}>
                              <GripVertical size={15} style={{ opacity: 0.5, flexShrink: 0 }} aria-hidden="true" />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {card.title}
                              </span>
                            </strong>

                            <div className="rm-admin-controls">
                              <label style={{ fontSize: 11, fontWeight: 800 }}>
                                М{" "}
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  className="rm-mini-input"
                                  aria-label={`Механика для ${card.title}`}
                                  value={draft.mechanics}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [card.id]: { ...draft, mechanics: Math.max(0, Math.min(20, Number(e.target.value) || 0)) },
                                    }))
                                  }
                                />
                              </label>
                              <label style={{ fontSize: 11, fontWeight: 800 }}>
                                Л{" "}
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  className="rm-mini-input"
                                  aria-label={`Логика для ${card.title}`}
                                  value={draft.logic}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [card.id]: { ...draft, logic: Math.max(0, Math.min(20, Number(e.target.value) || 0)) },
                                    }))
                                  }
                                />
                              </label>
                              <label style={{ fontSize: 11, fontWeight: 800 }}>
                                Т{" "}
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  className="rm-mini-input"
                                  aria-label={`Творчество для ${card.title}`}
                                  value={draft.creativity}
                                  onChange={(e) =>
                                    setDrafts((prev) => ({
                                      ...prev,
                                      [card.id]: { ...draft, creativity: Math.max(0, Math.min(20, Number(e.target.value) || 0)) },
                                    }))
                                  }
                                />
                              </label>
                              <select
                                aria-label={`Ранг для ${card.title}`}
                                className="rm-mini-input"
                                style={{ width: "auto", padding: "0 8px" }}
                                value={draft.rankIndex}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [card.id]: { ...draft, rankIndex: Number(e.target.value) },
                                  }))
                                }
                              >
                                {rankNames.map((name, idx) => (
                                  <option key={name} value={idx}>
                                    {ROADMAP_TIER_NUMERALS[idx]} · {name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="rm-admin-controls">
                            {dirty && (
                              <button
                                type="button"
                                className="rm-btn-primary"
                                style={{ minHeight: 38, padding: "0 12px" }}
                                disabled={busy}
                                onClick={() => void saveCardDraft(card)}
                              >
                                <Check size={15} aria-hidden="true" />
                                Сохранить
                              </button>
                            )}
                            <button
                              type="button"
                              className="rm-icon-btn"
                              aria-label={`Поднять ${card.title}`}
                              disabled={busy || index === 0}
                              onClick={() => void moveCard(tier.rankIndex, tier.cards, index, -1)}
                            >
                              <ArrowUp size={16} />
                            </button>
                            <button
                              type="button"
                              className="rm-icon-btn"
                              aria-label={`Опустить ${card.title}`}
                              disabled={busy || index === tier.cards.length - 1}
                              onClick={() => void moveCard(tier.rankIndex, tier.cards, index, 1)}
                            >
                              <ArrowDown size={16} />
                            </button>
                            <button
                              type="button"
                              className="rm-icon-btn"
                              aria-label={`Убрать ${card.title}`}
                              disabled={busy}
                              onClick={() => void removeCard(card)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </article>
                      )
                    })
                  )}
                </section>
              ))}
            </div>

            <aside className="rm-catalog-panel" aria-label="Добавить инструкцию на карту">
              <strong style={{ fontSize: 16 }}>Добавить на карту ({kitLabel})</strong>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
                Выберите ранг и награду (+М/+Л/+Т) перед добавлением. Порог ранга рассчитывается автоматически.
              </p>

              <div className="rm-admin-controls">
                <label style={{ fontSize: 12, fontWeight: 800, flex: "1 1 130px" }}>
                  Ранг
                  <select
                    className="rm-mini-input"
                    style={{ width: "100%", marginTop: 4, textAlign: "left", padding: "0 8px" }}
                    value={addRank}
                    onChange={(e) => setAddRank(Number(e.target.value))}
                  >
                    {rankNames.map((name, idx) => (
                      <option key={name} value={idx}>
                        {ROADMAP_TIER_NUMERALS[idx]} · {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: 12, fontWeight: 800 }}>
                  М
                  <input
                    type="number"
                    min={0}
                    max={20}
                    className="rm-mini-input"
                    style={{ display: "block", marginTop: 4 }}
                    value={addMech}
                    onChange={(e) => setAddMech(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 800 }}>
                  Л
                  <input
                    type="number"
                    min={0}
                    max={20}
                    className="rm-mini-input"
                    style={{ display: "block", marginTop: 4 }}
                    value={addLogic}
                    onChange={(e) => setAddLogic(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  />
                </label>
                <label style={{ fontSize: 12, fontWeight: 800 }}>
                  Т
                  <input
                    type="number"
                    min={0}
                    max={20}
                    className="rm-mini-input"
                    style={{ display: "block", marginTop: 4 }}
                    value={addCreat}
                    onChange={(e) => setAddCreat(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
                  />
                </label>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="search"
                  placeholder="Поиск инструкции…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="rm-mini-input"
                  style={{ width: "100%", textAlign: "left", padding: "0 12px" }}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700 }}>
                  <input
                    type="checkbox"
                    checked={onlyCurrentKit}
                    onChange={(e) => setOnlyCurrentKit(e.target.checked)}
                  />
                  Только инструкции набора {kitLabel}
                </label>
              </div>

              {filteredInstructions.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Подходящих инструкций нет.</p>
              ) : (
                filteredInstructions.map((inst) => {
                  const placed = placedByInstruction.get(inst.id)
                  const coverUrl = inst.coverAssetId
                    ? `/api/instruction-media/${inst.id}/${inst.coverAssetId}`
                    : inst.hasPdf
                      ? `/api/instructions/${encodeURIComponent(inst.slug)}/preview`
                      : null
                  return (
                    <div key={inst.id} className="rm-catalog-item">
                      <div className="rm-admin-thumb" style={{ width: 48, height: 38 }}>
                        {coverUrl ? <img src={coverUrl} alt="" /> : <Wrench size={16} aria-hidden="true" />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inst.title}
                        </div>
                        <small style={{ opacity: 0.7 }}>{inst.kit.toUpperCase()}</small>
                      </div>
                      {placed ? (
                        <span style={{ fontSize: 11, fontWeight: 800, opacity: 0.75 }}>
                          {rankNames[placed.rankIndex]}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="rm-btn-primary"
                          style={{ minHeight: 38, padding: "0 10px" }}
                          disabled={busy}
                          onClick={() => void addInstructionToMap(inst)}
                        >
                          <Plus size={15} aria-hidden="true" />
                          На карту
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </aside>
          </div>
        ) : (
          <div style={{ paddingTop: 18, display: "grid", gap: 16 }}>
            <section className="rm-admin-tier">
              <form onSubmit={searchStudents} style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <input
                  type="search"
                  minLength={2}
                  required
                  placeholder="Имя или логин ученика…"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  className="rm-mini-input"
                  style={{ flex: "1 1 220px", textAlign: "left", padding: "0 12px", minHeight: 44 }}
                />
                <button type="submit" className="rm-btn-primary" disabled={busy || studentQuery.trim().length < 2}>
                  <Search size={16} aria-hidden="true" />
                  Найти ученика
                </button>
              </form>

              {students.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {students.map((st) => (
                    <button
                      key={st.student_id}
                      type="button"
                      className="rm-kit-btn"
                      aria-pressed={selectedStudent?.student_id === st.student_id}
                      onClick={() => void loadStudentProgress(st)}
                    >
                      {st.nickname} ({st.login})
                    </button>
                  ))}
                </div>
              )}
            </section>

            {selectedStudent && (
              <section className="rm-admin-tier">
                <div className="rm-tier-head">
                  <div>
                    <strong style={{ fontSize: 18 }}>{selectedStudent.nickname}</strong>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                      {kitLabel} · Ранг: <strong>{rankNames[roadmapState.unlockedRank]}</strong> · {roadmapState.totalPoints} очк.
                    </div>
                  </div>
                </div>

                {roadmapState.tiers.map((tier) => {
                  if (tier.cards.length === 0) return null
                  return (
                    <div key={tier.rankIndex} style={{ display: "grid", gap: 8 }}>
                      <strong style={{ fontSize: 14 }}>
                        {tier.numeral} · {tier.rankName}
                      </strong>
                      {tier.cards.map((card) => {
                        const progress = studentProgress[card.id]
                        return (
                          <div key={card.id} className="rm-admin-card-row">
                            <div className="rm-admin-thumb">
                              {getRoadmapCardCoverUrl(card) ? (
                                <img src={getRoadmapCardCoverUrl(card)!} alt="" />
                              ) : (
                                <Wrench size={16} aria-hidden="true" />
                              )}
                            </div>
                            <strong style={{ fontSize: 14 }}>{card.title}</strong>
                            <div className="rm-admin-controls">
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
                                    ? Boolean(progress?.mechanicsDone)
                                    : skill.id === "logic"
                                      ? Boolean(progress?.logicDone)
                                      : Boolean(progress?.creativityDone)
                                return (
                                  <button
                                    key={skill.id}
                                    type="button"
                                    className={done ? "rm-btn-primary" : "rm-btn-secondary"}
                                    style={{ minHeight: 38, padding: "0 10px" }}
                                    disabled={busy}
                                    onClick={() => void toggleStudentSkill(card, skill.id, !done)}
                                  >
                                    {done && <Check size={14} aria-hidden="true" />}
                                    {skill.label} +{pts}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
