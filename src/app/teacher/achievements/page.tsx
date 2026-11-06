"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Award, Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import "./achievements.css"

type StudentResult = { student_id: string; nickname: string; login: string; achievement_awarded: boolean }

export default function TeacherAchievementsPage() {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [query, setQuery] = useState("")
  const [students, setStudents] = useState<StudentResult[]>([])
  const [confirmedParticipant, setConfirmedParticipant] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    async function checkRole() {
      const client = createClient()
      const { data: { user } } = await client.auth.getUser()
      if (!user) {
        router.replace("/login?next=/teacher/achievements")
        return
      }
      const [{ data: profile }, { data: isAdmin }] = await Promise.all([
        client.from("profiles").select("role,onboarding_complete").eq("id", user.id).maybeSingle(),
        client.rpc("is_instruction_admin"),
      ])
      if (!active) return
      if (profile?.role !== "teacher" && isAdmin !== true) {
        router.replace("/profile")
        return
      }
      setAllowed(true)
    }
    void checkRole().catch(() => router.replace("/profile"))
    return () => { active = false }
  }, [router])

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

  return (
    <main className="teacher-achievements-page">
      <div className="teacher-achievements-wrap">
        <Link href="/profile" className="teacher-achievements-back">← В профиль</Link>
        <section className="teacher-achievements-card">
          <div className="teacher-achievements-badge"><Award size={23} /></div>
          <p className="teacher-achievements-kicker">Для участников Mix and Match</p>
          <h1>Взболтать, но не смешивать</h1>
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
          {!allowed && <p className="teacher-achievements-loading">Проверяем доступ…</p>}
        </section>
      </div>
    </main>
  )
}
