"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import QRCode from "qrcode"
import { Copy, KeyRound, Plus, Trash2, Users, XCircle } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { SubscriptionGate } from "./subscription-gate"
import "./billing.css"

interface SchoolWorkspace {
  my_org_role?: "school_admin" | "teacher"
  org: {
    id: string
    name: string
    plan: "school_mini" | "school_pro"
    owner_id: string
    teacher_limit: number
    student_limit: number
  } | null
  subscription: {
    plan: string
    status: string
    current_period_end: string | null
  } | null
  groups: Array<{
    id: string
    name: string
    teacher_id: string | null
    is_default: boolean
  }>
  members: Array<{
    user_id: string
    org_role: "school_admin" | "teacher" | "student"
    group_id: string | null
    nickname: string
    login: string
    joined_at: string
  }>
  invites: Array<{
    id: string
    group_id: string | null
    target_role: "student" | "teacher"
    code_hint: string
    max_uses: number
    used_count: number
    expires_at: string
    revoked_at: string | null
    created_at: string
  }>
}

interface FreshInvite {
  invite_id: string
  code: string
  target_role: "student" | "teacher"
  max_uses: number
  expires_at: string
}

export function SchoolPanel() {
  const access = useAccess()
  const [workspace, setWorkspace] = useState<SchoolWorkspace | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const [groupName, setGroupName] = useState("")
  const [groupTeacherId, setGroupTeacherId] = useState("")
  const [groupBusy, setGroupBusy] = useState(false)

  const [inviteGroupId, setInviteGroupId] = useState("")
  const [inviteRole, setInviteRole] = useState<"student" | "teacher">("student")
  const [inviteMaxUses, setInviteMaxUses] = useState(30)
  const [inviteTtlMinutes, setInviteTtlMinutes] = useState(1440)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [freshInvite, setFreshInvite] = useState<FreshInvite | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string>("")
  const [busyActionId, setBusyActionId] = useState<string | null>(null)

  const loadWorkspace = useCallback(async () => {
    if (!access.userId) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/school", { cache: "no-store" })
      const payload = (await res.json().catch(() => ({}))) as SchoolWorkspace & {
        error?: { message?: string }
      }
      if (!res.ok) {
        setError(payload.error?.message || "Не удалось загрузить данные школы.")
        return
      }
      setWorkspace(payload)
      if (!inviteGroupId && payload.groups?.length) {
        setInviteGroupId(payload.groups[0].id)
      }
    } catch {
      setError("Не удалось подключиться к серверу.")
    } finally {
      setLoading(false)
    }
  }, [access.userId, inviteGroupId])

  useEffect(() => {
    if (!access.ready) return
    if (!access.userId) {
      setLoading(false)
      return
    }
    void loadWorkspace()
  }, [access.ready, access.userId, loadWorkspace])

  useEffect(() => {
    let active = true
    if (!freshInvite?.code) {
      setQrDataUrl("")
      return
    }
    const joinUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/join?code=${encodeURIComponent(freshInvite.code)}`
        : `/join?code=${encodeURIComponent(freshInvite.code)}`
    void QRCode.toDataURL(joinUrl, { width: 220, margin: 1 })
      .then((url) => {
        if (active) setQrDataUrl(url)
      })
      .catch(() => {
        if (active) setQrDataUrl("")
      })
    return () => {
      active = false
    }
  }, [freshInvite])

  if (!access.ready || loading) {
    return (
      <main className="bs-billing-page">
        <section className="bs-card" role="status">
          Загружаем панель школы…
        </section>
      </main>
    )
  }

  if (!access.userId || !access.canManageSchool || !workspace?.org) {
    return (
      <main className="bs-billing-page">
        <SubscriptionGate
          title="Управление школой и кодами"
          description="Раздел школы, учебных групп и QR-приглашений доступен по подписке School Mini или School Pro."
          userId={access.userId}
          nextPath="/teacher/school"
          canJoinSchool={true}
        />
      </main>
    )
  }

  const org = workspace.org
  const isSchoolAdmin = workspace.my_org_role === "school_admin"
  const subActive = workspace.subscription?.status === "active"
  const teacherCount = workspace.members.filter(
    (m) => m.org_role === "school_admin" || m.org_role === "teacher"
  ).length
  const studentCount = workspace.members.filter((m) => m.org_role === "student").length
  const staffMembers = workspace.members.filter(
    (m) => m.org_role === "school_admin" || m.org_role === "teacher"
  )

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (groupBusy || !groupName.trim()) return
    setGroupBusy(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/school/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org.id,
          name: groupName.trim(),
          teacherId: groupTeacherId || undefined,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        groupId?: string
        error?: { message?: string }
      }
      if (!res.ok) {
        setError(payload.error?.message || "Не удалось создать группу.")
        return
      }
      setGroupName("")
      setNotice("Учебная группа создана.")
      await loadWorkspace()
    } catch {
      setError("Ошибка сети при создании группы.")
    } finally {
      setGroupBusy(false)
    }
  }

  async function handleCreateInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inviteBusy) return
    setInviteBusy(true)
    setError("")
    setNotice("")
    try {
      const res = await fetch("/api/school/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: org.id,
          groupId: inviteGroupId || undefined,
          targetRole: inviteRole,
          maxUses: inviteMaxUses,
          ttlMinutes: inviteTtlMinutes,
        }),
      })
      const payload = (await res.json().catch(() => ({}))) as {
        invite?: FreshInvite
        error?: { message?: string }
      }
      if (!res.ok || !payload.invite) {
        setError(payload.error?.message || "Не удалось создать код приглашения.")
        return
      }
      setFreshInvite(payload.invite)
      setNotice("Новый код приглашения создан. Он показан полностью только сейчас — скопируйте или покажите QR классу.")
      await loadWorkspace()
    } catch {
      setError("Ошибка сети при создании кода.")
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setBusyActionId(inviteId)
    setError("")
    try {
      const res = await fetch(`/api/school/invites/${encodeURIComponent(inviteId)}/revoke`, {
        method: "POST",
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      if (!res.ok) {
        setError(payload.error?.message || "Не удалось отозвать код.")
        return
      }
      await loadWorkspace()
    } finally {
      setBusyActionId(null)
    }
  }

  async function handleRemoveMember(targetUserId: string) {
    setBusyActionId(targetUserId)
    setError("")
    try {
      const res = await fetch("/api/school/members/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: org.id, userId: targetUserId }),
      })
      const payload = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      if (!res.ok) {
        setError(payload.error?.message || "Не удалось удалить участника.")
        return
      }
      await loadWorkspace()
    } finally {
      setBusyActionId(null)
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      setNotice(`${label} скопирован.`)
    } catch {
      setError("Не удалось скопировать в буфер обмена.")
    }
  }

  const groupNameMap = new Map(workspace.groups.map((g) => [g.id, g.name]))

  return (
    <main className="bs-billing-page">
      <section className="bs-card">
        <p className="bs-eyebrow">Школьный кабинет</p>
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
            <h1 className="bs-title">{org.name}</h1>
            <p className="bs-muted" style={{ marginTop: 4 }}>
              Тариф: <strong>{org.plan === "school_pro" ? "School Pro" : "School Mini"}</strong> ·
              Учителей: {teacherCount}/{org.teacher_limit} · Учеников: {studentCount}/{org.student_limit}
            </p>
          </div>
          <span className={`bs-status-pill${subActive ? " is-active" : " is-warn"}`}>
            {subActive ? "Подписка активна" : "Требуется продление"}
          </span>
        </div>

        <div className="bs-actions-row">
          <Link href="/teacher/roadmap" className="bs-btn-primary">
            Настроить роадмап и прогресс
          </Link>
          <Link href="/billing" className="bs-btn-secondary">
            Тариф и продление
          </Link>
        </div>
      </section>

      {error && (
        <p role="alert" className="bs-alert is-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="bs-alert is-success">
          {notice}
        </p>
      )}

      <div className="bs-school-grid">
        <section className="bs-card">
          <h2 className="bs-title" style={{ fontSize: 20 }}>
            Создать код-приглашение
          </h2>
          <form onSubmit={handleCreateInvite} style={{ display: "grid", gap: 12 }}>
            {org.plan === "school_pro" && workspace.groups.length > 0 && (
              <div className="bs-field">
                <label htmlFor="invite-group">Группа</label>
                <select
                  id="invite-group"
                  className="bs-select"
                  value={inviteGroupId}
                  onChange={(e) => setInviteGroupId(e.target.value)}
                >
                  {workspace.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {org.plan === "school_pro" && isSchoolAdmin && (
              <div className="bs-field">
                <label htmlFor="invite-role">Роль приглашённого</label>
                <select
                  id="invite-role"
                  className="bs-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "student" | "teacher")}
                >
                  <option value="student">Ученик</option>
                  <option value="teacher">Учитель</option>
                </select>
              </div>
            )}

            <div className="bs-field">
              <label htmlFor="invite-ttl">Срок действия</label>
              <select
                id="invite-ttl"
                className="bs-select"
                value={inviteTtlMinutes}
                onChange={(e) => setInviteTtlMinutes(Number(e.target.value))}
              >
                <option value={60}>1 час (для урока)</option>
                <option value={1440}>24 часа</option>
                <option value={10080}>7 дней</option>
                <option value={43200}>30 дней</option>
              </select>
            </div>

            <div className="bs-field">
              <label htmlFor="invite-uses">Максимум использований</label>
              <input
                id="invite-uses"
                type="number"
                min={1}
                max={500}
                className="bs-input"
                value={inviteMaxUses}
                onChange={(e) => setInviteMaxUses(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
              />
            </div>

            <button type="submit" className="bs-btn-primary" disabled={inviteBusy || !subActive}>
              <KeyRound size={17} aria-hidden="true" />
              <span>{inviteBusy ? "Генерируем…" : "Сгенерировать код и QR"}</span>
            </button>
          </form>

          {freshInvite && (
            <div className="bs-invite-spotlight" role="region" aria-label="Новый код приглашения">
              {qrDataUrl && (
                <img src={qrDataUrl} alt={`QR для кода ${freshInvite.code}`} className="bs-qr-img" />
              )}
              <div style={{ display: "grid", gap: 10, flex: "1 1 200px" }}>
                <div className="bs-invite-code-big">{freshInvite.code}</div>
                <p className="bs-muted">
                  Роль: {freshInvite.target_role === "teacher" ? "Учитель" : "Ученик"} · до{" "}
                  {freshInvite.max_uses} входов
                </p>
                <div className="bs-actions-row">
                  <button
                    type="button"
                    className="bs-btn-primary"
                    onClick={() => void copyText(freshInvite.code, "Код")}
                  >
                    <Copy size={16} aria-hidden="true" />
                    <span>Копировать код</span>
                  </button>
                  <button
                    type="button"
                    className="bs-btn-secondary"
                    onClick={() => {
                      const url = `${window.location.origin}/join?code=${encodeURIComponent(freshInvite.code)}`
                      void copyText(url, "Ссылка приглашения")
                    }}
                  >
                    <Copy size={16} aria-hidden="true" />
                    <span>Копировать ссылку</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="bs-card">
          <h2 className="bs-title" style={{ fontSize: 20 }}>
            {org.plan === "school_pro" ? "Учебные группы" : "Инвайты"}
          </h2>

          {org.plan === "school_pro" && isSchoolAdmin && (
            <form onSubmit={handleCreateGroup} style={{ display: "grid", gap: 10 }}>
              <div className="bs-field">
                <label htmlFor="new-group-name">Новая группа</label>
                <input
                  id="new-group-name"
                  type="text"
                  maxLength={80}
                  className="bs-input"
                  placeholder="Например: Группа 5Б — SPIKE"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>
              {staffMembers.length > 1 && (
                <div className="bs-field">
                  <label htmlFor="new-group-teacher">Ответственный учитель</label>
                  <select
                    id="new-group-teacher"
                    className="bs-select"
                    value={groupTeacherId}
                    onChange={(e) => setGroupTeacherId(e.target.value)}
                  >
                    <option value="">По умолчанию (вы)</option>
                    {staffMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.nickname} ({m.login})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="submit"
                className="bs-btn-secondary"
                disabled={groupBusy || !groupName.trim() || !subActive}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{groupBusy ? "Создаём…" : "Добавить группу"}</span>
              </button>
            </form>
          )}

          <ul className="bs-list">
            {workspace.invites.length === 0 ? (
              <li className="bs-muted">Активных приглашений пока нет.</li>
            ) : (
              workspace.invites.map((inv) => {
                const expired = new Date(inv.expires_at).getTime() <= Date.now()
                const active = !inv.revoked_at && !expired && inv.used_count < inv.max_uses
                return (
                  <li key={inv.id} className="bs-list-row">
                    <div>
                      <strong style={{ fontFamily: "monospace", letterSpacing: "0.08em" }}>
                        {inv.code_hint}
                      </strong>
                      <div className="bs-muted" style={{ fontSize: 12.5 }}>
                        {inv.target_role === "teacher" ? "Учитель" : "Ученик"}
                        {inv.group_id && groupNameMap.get(inv.group_id)
                          ? ` · ${groupNameMap.get(inv.group_id)}`
                          : ""}
                        {" · "}
                        {inv.used_count}/{inv.max_uses} входов
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`bs-status-pill${active ? " is-active" : ""}`}>
                        {inv.revoked_at
                          ? "Отозван"
                          : expired
                            ? "Истёк"
                            : inv.used_count >= inv.max_uses
                              ? "Исчерпан"
                              : "Активен"}
                      </span>
                      {active && (
                        <button
                          type="button"
                          className="bs-btn-danger"
                          style={{ padding: "0 12px" }}
                          disabled={busyActionId === inv.id}
                          onClick={() => void handleRevokeInvite(inv.id)}
                        >
                          <XCircle size={15} aria-hidden="true" />
                          <span>Отозвать</span>
                        </button>
                      )}
                    </div>
                  </li>
                )
              })
            )}
          </ul>
        </section>
      </div>

      <section className="bs-card">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={20} aria-hidden="true" />
          <h2 className="bs-title" style={{ fontSize: 20 }}>
            Участники школы ({workspace.members.length})
          </h2>
        </div>

        <ul className="bs-list">
          {workspace.members.map((member) => {
            const canRemove =
              member.user_id !== org.owner_id &&
              member.user_id !== access.userId &&
              (isSchoolAdmin || member.org_role === "student")
            return (
              <li key={member.user_id} className="bs-list-row">
                <div>
                  <strong>{member.nickname}</strong>{" "}
                  <span className="bs-muted">({member.login})</span>
                  <div className="bs-muted" style={{ fontSize: 12.5 }}>
                    {member.org_role === "school_admin"
                      ? "Администратор школы"
                      : member.org_role === "teacher"
                        ? "Учитель"
                        : "Ученик"}
                    {member.group_id && groupNameMap.get(member.group_id)
                      ? ` · ${groupNameMap.get(member.group_id)}`
                      : ""}
                  </div>
                </div>
                {canRemove && (
                  <button
                    type="button"
                    className="bs-btn-danger"
                    style={{ padding: "0 12px" }}
                    disabled={busyActionId === member.user_id}
                    onClick={() => void handleRemoveMember(member.user_id)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                    <span>Удалить</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
