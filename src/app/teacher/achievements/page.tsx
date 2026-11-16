"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Award, Search } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { createClient } from "@/utils/supabase/client"
import { StudentAwardsAdmin } from "./student-awards-admin"
import "./achievements.css"

type StudentResult = { student_id: string; nickname: string; login: string; achievement_awarded: boolean }

export default function TeacherAchievementsPage() {
  const router = useRouter()
  const { ready, userId, role, isAdmin, error, refreshProfile } = useAccess()
  const allowed = Boolean(userId && (role === "teacher" || isAdmin))

  useEffect(() => {
    if (!ready || allowed || error) return
    router.replace(userId ? "/profile" : "/login?next=/teacher/achievements")
  }, [allowed, error, ready, router, userId])

  return <main className="teacher-achievements-page">
    <div className="teacher-achievements-wrap">
      <Link href="/profile" className="teacher-achievements-back">← В профиль</Link>
      {error ? <section className="teacher-achievements-card">
        <p className="teacher-achievements-error" role="alert">Не удалось проверить доступ.</p>
        <button type="button" className="teacher-achievements-retry" onClick={() => void refreshProfile().catch(() => {})}>Повторить</button>
      </section>
      : !ready || !allowed ? <p className="teacher-achievements-loading" role="status">Проверяем доступ…</p>
      : isAdmin ? <div key={userId} className="teacher-achievements-wrap">
        <StudentAwardsAdmin />
        <details className="teacher-achievements-legacy">
          <summary>Mix and Match 2025–2026</summary>
          <MixMatchAwards secondary />
        </details>
      </div>
      : <MixMatchAwards key={userId} />}
    </div>
  </main>
}

function MixMatchAwards({ secondary = false }: { secondary?: boolean }) {
  const [query, setQuery] = useState("")
  const [students, setStudents] = useState<StudentResult[]>([])
  const [confirmedParticipant, setConfirmedParticipant] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    setError("")
    if (query.trim().length < 2) {
      setError("Введите минимум два символа имени или логина.")
      return
    }
    setBusy(true)
    try {
      const { data, error: rpcError } = await createClient().rpc("search_students_for_mix_match_award", { p_query: query.trim() })
      if (rpcError) throw rpcError
      setStudents((data || []) as StudentResult[])
      setConfirmedParticipant(false)
      if (!data?.length) setMessage("Ученики не найдены. Проверьте имя или логин.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось найти ученика.")
    } finally {
      setBusy(false)
    }
  }

  async function award(student: StudentResult) {
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const { data, error: rpcError } = await createClient().rpc("award_mix_match_achievement", {
        p_student_id: student.student_id,
        p_confirmed_participant: confirmedParticipant,
      })
      if (rpcError) throw rpcError
      const result = data as { awarded?: boolean }
      setStudents((current) => current.map((item) => item.student_id === student.student_id ? { ...item, achievement_awarded: true } : item))
      setConfirmedParticipant(false)
      setMessage(result.awarded ? `Достижение выдано ученику ${student.nickname}.` : `У ученика ${student.nickname} это достижение уже есть.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выдать достижение.")
    } finally {
      setBusy(false)
    }
  }

  const Title = secondary ? "h2" : "h1"
  return (
        <section className="teacher-achievements-card">
          <div className="teacher-achievements-badge"><Award size={23} aria-hidden="true" /></div>
          <Title className="teacher-achievements-title">Взболтать, но не смешивать</Title>
          <p className="teacher-achievements-description">Выдайте достижение ученику, который участвовал в соревновании Mix and Match 2025–2026. Вместе с наградой откроется первый аксессуар для аватара.</p>

          <form className="teacher-achievements-search" onSubmit={search}>
            <label htmlFor="achievement-student">Найти ученика по имени или логину</label>
            <div className="teacher-achievements-search-row"><input id="achievement-student" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя или логин ученика" autoComplete="off" /><button type="submit" disabled={busy}><Search size={17} /> Найти</button></div>
          </form>

          <label className="teacher-achievements-confirm"><input type="checkbox" checked={confirmedParticipant} onChange={(event) => setConfirmedParticipant(event.target.checked)} /><span>Подтверждаю, что выбранный ученик участвовал в Mix and Match 2025–2026.</span></label>

          {error && <p className="teacher-achievements-error" role="alert">{error}</p>}
          {message && <p className="teacher-achievements-message" role="status">{message}</p>}

          <div className="teacher-achievements-results">
            {students.map((student) => <article key={student.student_id} className="teacher-achievements-student">
              <div><strong>{student.nickname}</strong><span>{student.login}</span></div>
              {student.achievement_awarded
                ? <span className="teacher-achievements-issued">Уже выдано</span>
                : <button type="button" disabled={busy || !confirmedParticipant} onClick={() => void award(student)}>Выдать достижение</button>}
            </article>)}
          </div>
        </section>
  )
}
