"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { Check, Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"

type Student = { student_id: string; nickname: string; login: string }
type Achievement = { key: string; title: string; awarded_at: string | null }
type Lesson = {
  instruction_id: string
  build_difficulty: number | null
  program_enabled: boolean
  build_done: boolean
  program_done: boolean
}
type Instruction = { id: string; title: string }
type AdminData = { achievements: Achievement[]; lessons: Lesson[] }
type Feedback = { kind: "error" | "success"; text: string }

async function readAchievements(studentId: string, signal?: AbortSignal) {
  const query = createClient().rpc("tlc_learning_admin", { p_student_id: studentId })
  const { data, error } = await (signal ? query.abortSignal(signal) : query)
  if (error || !data) throw new Error("Не удалось загрузить достижения.")
  return data as AdminData
}

function FeedbackMessage({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  return <p className={feedback.kind === "error" ? "teacher-achievements-error" : "teacher-achievements-message"} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.text}</p>
}

function WorkConfirmation({
  busy, lessons, onConfirm,
}: {
  busy: boolean
  lessons: Lesson[]
  onConfirm: (id: string, kind: string) => Promise<boolean>
}) {
  const [instructions, setInstructions] = useState<Instruction[]>([])
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState("")
  const [selected, setSelected] = useState("")
  const [kind, setKind] = useState("")
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({})
  const lesson = lessons.find(item => item.instruction_id === selected)
  const canBuild = (!lesson || (lesson.build_difficulty !== null && !lesson.build_done))
    && !confirmed[`${selected}:build`]
  const canProgram = (!lesson || (lesson.program_enabled && !lesson.program_done))
    && !confirmed[`${selected}:program`]
  const canConfirm = kind === "build" ? canBuild : kind === "program" && canProgram

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (searching || !query.trim()) return
    setSearching(true)
    setStatus("")
    setSelected("")
    setKind("")
    setInstructions([])
    try {
      const term = query.trim().replace(/[\%_*]/g, char => `\${char}`)
      const { data, error } = await createClient().from("instructions")
        .select("id,title")
        .eq("status", "published")
        .ilike("title", `%${term}%`)
        .order("title")
        .order("id")
        .limit(30)
      if (error) throw error
      setInstructions(data ?? [])
      if (!data?.length) setStatus("Подходящих инструкций нет.")
      else if (data.length === 30) setStatus("Первые 30 результатов. Уточните название, чтобы сузить поиск.")
    } catch {
      setStatus("Не удалось найти инструкции. Повторите поиск.")
    } finally {
      setSearching(false)
    }
  }

  return (
    <details className="achievement-admin-details">
      <summary>Подтвердить работу</summary>
      <form className="achievement-admin-form" onSubmit={search}>
        <label>Название инструкции
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} required maxLength={100} />
        </label>
        <button type="submit" disabled={busy || searching || !query.trim()}>{searching ? "Ищем…" : "Найти инструкцию"}</button>
        {status && <p role="status">{status}</p>}
      </form>
      {instructions.length > 0 && (
        <form className="achievement-admin-form" onSubmit={async event => {
          event.preventDefault()
          if (!selected || !canConfirm) return
          if (await onConfirm(selected, kind)) {
            setConfirmed(current => ({ ...current, [`${selected}:${kind}`]: true }))
            setKind("")
          }
        }}>
          <label>Инструкция
            <select value={selected} disabled={busy} required onChange={event => { setSelected(event.target.value); setKind("") }}>
              <option value="">Выберите инструкцию</option>
              {instructions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
          </label>
          {selected && (canBuild || canProgram ? (
            <label>Что выполнено
              <select value={kind} required disabled={busy} onChange={event => setKind(event.target.value)}>
                <option value="">Выберите вид работы</option>
                {canBuild && <option value="build">Сборка</option>}
                {canProgram && <option value="program">Программа</option>}
              </select>
            </label>
          ) : <p>Доступные работы по этой инструкции уже подтверждены.</p>)}
          <button type="submit" disabled={busy || !selected || !canConfirm}>Подтвердить</button>
        </form>
      )}
    </details>
  )
}

function StudentAwards({ student }: { student: Student }) {
  const [progress, setProgress] = useState<AdminData | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [busy, setBusy] = useState(false)
  const writeLock = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    void readAchievements(student.student_id, controller.signal).then(data => {
      if (!controller.signal.aborted) {
        setProgress(data)
        setLoadError(false)
      }
    }).catch(() => {
      if (!controller.signal.aborted) setLoadError(true)
    })
    return () => controller.abort()
  }, [student.student_id, retry])

  async function save(makeRequest: () => Promise<string>, errorText: string) {
    if (writeLock.current) return false
    writeLock.current = true
    setBusy(true)
    setFeedback(null)
    try {
      const success = await makeRequest()
      try {
        setProgress(await readAchievements(student.student_id))
        setFeedback({ kind: "success", text: success })
      } catch {
        setProgress(null)
        setLoadError(true)
        setFeedback({ kind: "success", text: success })
      }
      return true
    } catch {
      setFeedback({ kind: "error", text: errorText })
      return false
    } finally {
      writeLock.current = false
      setBusy(false)
    }
  }

  function confirmWork(instructionId: string, kind: string) {
    return save(async () => {
      const { data, error } = await createClient().rpc("tlc_learning_confirm", {
        p_student_id: student.student_id,
        p_instruction_id: instructionId,
        p_kind: kind,
      })
      if (error || !data) throw error ?? new Error("Work confirmation failed")
      return data.applied ? `Работа зачтена. Начислено ${data.xp} XP.` : "Эта работа уже зачтена."
    }, "Не удалось подтвердить работу. Проверьте инструкцию и повторите попытку.")
  }

  function award(achievement: Achievement) {
    return save(async () => {
      const { error } = await createClient().rpc("tlc_learning_award", {
        p_student_id: student.student_id,
        p_key: achievement.key,
      })
      if (error) throw error
      return `Достижение «${achievement.title}» выдано.`
    }, "Не удалось выдать достижение. Проверьте подключение и повторите попытку.")
  }

  function defineAchievement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const fields = new FormData(formElement)
    const title = String(fields.get("title") ?? "").trim()
    const kind = String(fields.get("kind") ?? "")
    if (!title) return
    return save(async () => {
      const { error } = await createClient().rpc("tlc_learning_define_achievement", { p_title: title, p_kind: kind })
      if (error) throw error
      formElement.reset()
      return `«${title}» теперь можно выдать ученику.`
    }, "Не удалось создать достижение. Проверьте название и повторите попытку.")
  }

  const achievements = progress?.achievements.filter(item => item.key !== "mix_and_match_2025_2026" && item.key !== "ten_builds") ?? []
  return <section className="achievement-admin-section" aria-label={`Награды ученика ${student.nickname}`}>
    <div className="achievement-admin-student-heading"><h2>{student.nickname}</h2><span>{student.login}</span></div>
    <FeedbackMessage feedback={feedback} />
    {loadError
      ? <div className="achievement-admin-retry"><p role="alert">Не удалось загрузить награды.</p><button type="button" onClick={() => { setLoadError(false); setRetry(value => value + 1) }}>Повторить</button></div>
      : !progress ? <p role="status">Загружаю награды…</p>
      : <>
        <WorkConfirmation busy={busy} lessons={progress.lessons} onConfirm={confirmWork} />
        <h3>Награды и события</h3>
        <details className="achievement-admin-details">
          <summary>Создать награду</summary>
          <form className="achievement-admin-form" onSubmit={defineAchievement}>
            <label>Название<input name="title" required maxLength={100} placeholder="Например, 10 собранных роботов" /></label>
            <label>Основание<select name="kind"><option value="competition">Соревнование</option><option value="event">Событие или этап</option></select></label>
            <button type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Добавить"}</button>
          </form>
        </details>
        {achievements.length === 0
          ? <p>Пока нет доступных наград.</p>
          : <ul className="achievement-admin-list">
            {achievements.map(achievement => <li key={achievement.key}>
              <strong>{achievement.title}</strong>
              <button type="button" disabled={busy || Boolean(achievement.awarded_at)} onClick={() => void award(achievement)}>
                {achievement.awarded_at ? <><Check size={15} aria-hidden="true" /> Выдано</> : "Выдать"}
              </button>
            </li>)}
          </ul>}
      </>}
  </section>
}

export function StudentAwardsAdmin() {
  const [query, setQuery] = useState("")
  const [students, setStudents] = useState<Student[]>([])
  const [student, setStudent] = useState<Student | null>(null)
  const [searching, setSearching] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    if (term.length < 2 || searching) return
    setSearching(true)
    setStudents([])
    setStudent(null)
    setFeedback(null)
    try {
      const { data, error } = await createClient().rpc("tlc_learning_students", { p_query: term })
      if (error) throw error
      const matches = (data ?? []) as Student[]
      setStudents(matches)
      if (matches.length === 0) setFeedback({ kind: "success", text: "Ученики не найдены. Проверьте имя или логин." })
    } catch {
      setFeedback({ kind: "error", text: "Не удалось найти ученика. Повторите поиск." })
    } finally {
      setSearching(false)
    }
  }

  return <section className="teacher-achievements-card achievement-admin">
    <h1>Достижения учеников</h1>
    <section className="achievement-admin-section" aria-labelledby="achievement-students-heading">
      <h2 id="achievement-students-heading">Ученики</h2>
      <form className="teacher-achievements-search" onSubmit={search}>
        <label htmlFor="achievement-student-query">Имя или логин</label>
        <div className="teacher-achievements-search-row">
          <input id="achievement-student-query" value={query} onChange={event => setQuery(event.target.value)} minLength={2} maxLength={64} required autoComplete="off" />
          <button type="submit" disabled={searching || query.trim().length < 2}><Search size={17} aria-hidden="true" />{searching ? "Ищу…" : "Найти"}</button>
        </div>
      </form>
      <FeedbackMessage feedback={feedback} />
      {students.length > 0 && <ul className="achievement-admin-roster" aria-label="Результаты поиска">
        {students.map(item => <li key={item.student_id}>
          <button type="button" aria-pressed={student?.student_id === item.student_id} onClick={() => setStudent(item)}>
            <strong>{item.nickname}</strong><span>{item.login}</span>
          </button>
        </li>)}
      </ul>}
    </section>
    {student && <StudentAwards key={student.student_id} student={student} />}
  </section>
}
