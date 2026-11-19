"use client"

import { CalendarDays, Check, Flame } from "lucide-react"
import { useEffect, useState } from "react"
import { createClient } from "@/utils/supabase/client"
import "./work-study-widgets.css"

type StudyWeek = {
  today: string
  monday: string
  days: Record<string, number>
  streak: number
  multiplier: number
  next_multiplier: number
  total_xp: number
}

const DAY = 86_400_000
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const studioDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Aqtobe", year: "numeric", month: "2-digit", day: "2-digit" })
const monthLabel = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "UTC" })
const dateLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long", timeZone: "UTC" })
const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 })
const plural = new Intl.PluralRules("ru-RU")

export function counted(count: number, one: string, few: string, many: string) {
  const form = plural.select(count)
  return `${count} ${form === "one" ? one : form === "few" ? few : many}`
}

export function useStudyWeek(student: boolean) {
  const [today, setToday] = useState("")
  const [week, setWeek] = useState<StudyWeek | null>(null)
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    function updateDate() {
      const parts = studioDate.formatToParts()
      const part = (key: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === key)?.value
      setToday(`${part("year")}-${part("month")}-${part("day")}`)
    }
    updateDate()
    const timer = window.setInterval(updateDate, 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!student || !today) return
    let request: AbortController | undefined
    async function load() {
      if (request && !request.signal.aborted) return
      const controller = new AbortController()
      request = controller
      try {
        const { data, error } = await createClient().rpc("tlc_learning_my_study_week").abortSignal(controller.signal)
        if (controller.signal.aborted) return
        if (error || !data) throw new Error("Study week unavailable")
        setWeek(data as StudyWeek)
        setFailed(false)
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      } finally {
        if (request === controller) request = undefined
      }
    }

    function refresh() {
      if (document.visibilityState === "visible") void load()
    }

    void load()
    const timer = window.setInterval(refresh, 120_000)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      request?.abort()
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [student, today, retry])

  const activeWeek = student && week?.today === today ? week : null
  const reload = () => { setFailed(false); setRetry(value => value + 1) }
  return { today, activeWeek, failed, reload }
}

export function WorkStudyWidgets({ student }: { student: boolean }) {
  const { today, activeWeek, failed, reload } = useStudyWeek(student)
  const now = today ? new Date(`${today}T00:00:00Z`) : null
  const monday = activeWeek ? Date.parse(activeWeek.monday) : now ? +now - ((now.getUTCDay() + 6) % 7) * DAY : null
  const streak = activeWeek?.streak

  return (
    <div className="study-widgets">
      <section className="study-calendar" aria-label="Календарь недели" aria-busy={student && !activeWeek && !failed}>
        <header>
          <h2><CalendarDays size={17} aria-hidden="true" /> Неделя</h2>
          {now && <span>{monthLabel.format(now)}</span>}
        </header>
        <ol className="study-calendar-days">
          {WEEKDAYS.map((label, i) => {
            const day = monday === null ? null : new Date(monday + i * DAY)
            const key = day?.toISOString().slice(0, 10)
            const completed = key ? activeWeek?.days[key] ?? 0 : 0
            const isToday = Boolean(key && key === today)
            return (
              <li key={label} className={completed ? "is-complete" : undefined} aria-current={isToday ? "date" : undefined}>
                {day && <span className="sr-only">{dateLabel.format(day)}{completed ? `, подтверждено: ${counted(completed, "работа", "работы", "работ")}` : ""}</span>}
                <span aria-hidden={Boolean(day)}>{label}</span>
                <strong aria-hidden="true">{day?.getUTCDate() ?? "–"}</strong>
                {completed > 0 && <Check size={12} aria-hidden="true" className="study-calendar-check" />}
              </li>
            )
          })}
        </ol>
      </section>
      {student && (
        <section className="study-fire" aria-label="Огонёк">
          <span className="study-fire-icon" data-active={Boolean(streak)}><Flame size={24} aria-hidden="true" /></span>
          <div>
            <h2>Огонёк</h2>
            {failed ? (
              <button type="button" onClick={reload}>Повторить загрузку</button>
            ) : activeWeek ? (
              <>
                <p><strong>{counted(activeWeek.streak, "день", "дня", "дней")} подряд</strong> <span className="study-multiplier" aria-label={`Множитель XP ${number.format(activeWeek.multiplier)}`}>×{number.format(activeWeek.multiplier)}</span></p>
                <small>Всего {number.format(activeWeek.total_xp)} XP · следующий зачёт ×{number.format(activeWeek.next_multiplier)}</small>
              </>
            ) : <p role="status">Загружаем серию…</p>}
          </div>
        </section>
      )}
    </div>
  )
}
