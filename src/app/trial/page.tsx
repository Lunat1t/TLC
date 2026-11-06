"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, Blocks, Bot, CalendarDays, Check, Code2, Cpu, MessageCircle, Sparkles, UserRound } from "lucide-react"
import "./trial.css"

const courses = [
  { id: "wedo", name: "LEGO WeDo", icon: Blocks, color: "coral" },
  { id: "spike", name: "LEGO SPIKE", icon: Bot, color: "yellow" },
  { id: "ev3", name: "LEGO EV3", icon: Cpu, color: "blue" },
  { id: "arduino", name: "Arduino", icon: Cpu, color: "mint" },
  { id: "code", name: "Программирование", icon: Code2, color: "lilac" },
] as const
const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]
const monthNames = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}`
}

export default function TrialPage() {
  const [language, setLanguage] = useState<"ru" | "kk">("ru")
  const [step, setStep] = useState(0)
  const [studentName, setStudentName] = useState("")
  const [age, setAge] = useState("")
  const [selectedCourses, setSelectedCourses] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState("")
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const kk = language === "kk"
  const t = (ru: string, kz: string) => kk ? kz : ru

  useEffect(() => {
    if (localStorage.getItem("tlc.site-language") === "kk") setLanguage("kk")
  }, [])

  const firstDay = useMemo(() => new Date(month.getFullYear(), month.getMonth(), 1), [month])
  const calendarDays = useMemo(() => {
    const mondayOffset = (firstDay.getDay() + 6) % 7
    const count = Math.ceil((mondayOffset + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 7) * 7
    return Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - mondayOffset + 1))
  }, [firstDay, month])
  const chosenCourses = courses.filter(course => selectedCourses.includes(course.id)).map(course => course.name)
  const validName = studentName.trim().length >= 2
  const ready = step === 0 ? validName : step === 1 ? /^\d{1,2}$/.test(age) && Number(age) >= 4 && Number(age) <= 18 : step === 2 ? selectedCourses.length > 0 : !!selectedDate
  const dateForMessage = selectedDate ? new Date(`${selectedDate}T12:00:00`) : null
  const dateText = dateForMessage?.toLocaleDateString(kk ? "kk-KZ" : "ru-RU", { day: "numeric", month: "long", year: "numeric" }) ?? ""
  const message = t(
    `Здравствуйте! Хочу записать ребёнка на пробное занятие.\n\nИмя ученика: ${studentName.trim()}\nВозраст: ${age}\nНаправление: ${chosenCourses.join(", ")}\nЖелаемая дата: ${dateText}\n\nПодскажите, пожалуйста, есть ли свободное время в этот день?`,
    `Сәлеметсіз бе! Баламды сынақ сабағына жазғым келеді.\n\nОқушының аты: ${studentName.trim()}\nЖасы: ${age}\nБағыты: ${chosenCourses.join(", ")}\nҚалаған күні: ${dateText}\n\nОсы күні бос уақыт бар ма?`
  )
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`

  function next() {
    if (step < 4 && ready) setStep(value => value + 1)
  }

  function previous() {
    setStep(value => Math.max(0, value - 1))
  }

  function toggleCourse(id: string) {
    setSelectedCourses(old => old.includes(id) ? old.filter(item => item !== id) : [...old, id])
  }

  const headings = [
    t("Как зовут ученика?", "Оқушының аты кім?"),
    t("Сколько ему лет?", "Ол нешеде?"),
    t("Что ему интересно?", "Оған не қызық?"),
    t("Выберите удобную дату", "Өзіңізге ыңғайлы күнді таңдаңыз"),
  ]
  const descriptions = [
    t("Напишите имя ребёнка, которого хотите записать.", "Жазылғыңыз келетін баланың атын жазыңыз."),
    t("Возраст поможет подобрать подходящую группу.", "Жасына сай топ таңдауға көмектеседі."),
    t("Можно отметить несколько направлений.", "Бірнеше бағытты таңдауға болады."),
    t("Это макет календаря. Свободное время подтвердим в WhatsApp.", "Бұл күнтізбенің макеті. Бос уақытты WhatsApp арқылы нақтылаймыз."),
  ]

  return <main className="trial-page" lang={language}>
    <header className="trial-header">
      <Link href="/" className="trial-logo">techlab</Link>
      <Link href="/login" className="trial-login">{t("Уже есть аккаунт?", "Аккаунтыңыз бар ма?")}</Link>
    </header>
    <div className="trial-progress-row">
      <button type="button" className="trial-back" onClick={() => step === 0 ? window.location.assign("/") : previous()} aria-label={t("Назад", "Артқа")}><ArrowLeft size={21} /></button>
      <div className="trial-progress" role="progressbar" aria-label={t("Запись на пробное занятие", "Сынақ сабағына жазылу")} aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1}><span style={{ transform: `scaleX(${(step + 1) / 5})` }} /></div>
      <span className="trial-step-count">{step + 1} / 5</span>
    </div>

    {step < 4 ? <section className="trial-content" aria-labelledby="trial-title">
      <div className="trial-heading">
        <span className="trial-sparkle"><Sparkles size={22} /></span>
        <h1 id="trial-title">{headings[step]}</h1>
        <p>{descriptions[step]}</p>
      </div>

      {step === 0 && <div className="trial-answer">
        <span className="trial-art art-blue"><UserRound size={46} /></span>
        <label htmlFor="student-name">{t("Имя ученика", "Оқушының аты")}</label>
        <input autoFocus id="student-name" autoComplete="off" maxLength={80} value={studentName} onChange={event => setStudentName(event.target.value)} placeholder={t("Например, Алия Садыкова", "Мысалы, Әлия Сәдуақасова")} />
      </div>}

      {step === 1 && <div className="trial-answer">
        <span className="trial-art art-yellow"><Sparkles size={46} /></span>
        <label htmlFor="student-age">{t("Возраст ученика", "Оқушының жасы")}</label>
        <div className="trial-age-input"><input autoFocus id="student-age" inputMode="numeric" type="number" min="4" max="18" value={age} onChange={event => setAge(event.target.value)} placeholder="10" /><span>{t("лет", "жас")}</span></div>
      </div>}

      {step === 2 && <div className="trial-courses" role="group" aria-label={headings[2]}>{courses.map(course => <button type="button" key={course.id} className={`trial-course ${selectedCourses.includes(course.id) ? "is-selected" : ""}`} aria-pressed={selectedCourses.includes(course.id)} onClick={() => toggleCourse(course.id)}>
        <span className={`trial-art art-${course.color}`}><course.icon size={36} /></span><strong>{course.name}</strong>{selectedCourses.includes(course.id) && <Check size={19} className="trial-course-check" />}
      </button>)}</div>}

      {step === 3 && <div className="trial-calendar">
        <div className="trial-calendar-caption"><CalendarDays size={20} /><strong>{t("Календарь занятий", "Сабақ күнтізбесі")}</strong></div>
        <div className="trial-calendar-nav">
          <button type="button" aria-label={t("Предыдущий месяц", "Алдыңғы ай")} disabled={monthKey(month) === monthKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ArrowLeft size={18} /></button>
          <h2>{kk ? firstDay.toLocaleDateString("kk-KZ", { month: "long", year: "numeric" }) : `${monthNames[month.getMonth()]} ${month.getFullYear()}`}</h2>
          <button type="button" aria-label={t("Следующий месяц", "Келесі ай")} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ArrowRight size={18} /></button>
        </div>
        <div className="trial-calendar-grid" role="grid" aria-label={t("Выберите дату", "Күнді таңдаңыз")}>
          {weekdays.map((day, index) => <span className="trial-weekday" key={day}>{kk ? ["Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жс"][index] : day}</span>)}
          {calendarDays.map(day => {
            const key = dayKey(day)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const past = day < today
            const inMonth = day.getMonth() === month.getMonth()
            return <button type="button" role="gridcell" key={key} disabled={past || !inMonth} aria-pressed={selectedDate === key} aria-label={day.toLocaleDateString(kk ? "kk-KZ" : "ru-RU", { day: "numeric", month: "long", year: "numeric" })} className={`trial-day ${!inMonth ? "is-outside" : ""} ${selectedDate === key ? "is-selected" : ""}`} onClick={() => setSelectedDate(key)}>{day.getDate()}</button>
          })}
        </div>
        {selectedDate && <p className="trial-date-selected"><Check size={16} />{t("Выбрана дата:", "Таңдалған күн:")} <strong>{dateText}</strong></p>}
        <p className="trial-calendar-note">{t("Дата пока предварительная — команда школы подтвердит время в WhatsApp.", "Күн әзірге алдын ала таңдалады — мектеп уақыты WhatsApp арқылы растайды.")}</p>
      </div>}
    </section> : <section className="trial-content trial-finish" aria-labelledby="trial-title">
      <span className="trial-art art-mint trial-finish-art"><MessageCircle size={44} /></span>
      <h1 id="trial-title">{t("Сообщение готово!", "Хабарлама дайын!")}</h1>
      <p className="trial-finish-description">{t("Проверьте данные и откройте WhatsApp. Дата пока предварительная — школа подтвердит свободное время.", "Мәліметтерді тексеріп, WhatsApp ашыңыз. Күн алдын ала таңдалды — мектеп бос уақытты растайды.")}</p>
      <div className="trial-summary"><p><span>{t("Ученик", "Оқушы")}</span><strong>{studentName.trim()}, {age} {t("лет", "жас")}</strong></p><p><span>{t("Направление", "Бағыты")}</span><strong>{chosenCourses.join(", ")}</strong></p><p><span>{t("Желаемая дата", "Қалаған күні")}</span><strong>{dateText}</strong></p></div>
      <a className="trial-whatsapp" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={20} />{t("Продолжить в WhatsApp", "WhatsApp-та жалғастыру")}</a>
      <p className="trial-send-hint">{t("Сообщение откроется в WhatsApp. Выберите чат школы и нажмите «Отправить».", "Хабарлама WhatsApp-та ашылады. Мектеп чатын таңдап, «Жіберу» түймесін басыңыз.")}</p>
    </section>}

    <footer className="trial-footer"><div><p>{t("Пробное занятие", "Сынақ сабағы")}<span>{t("Первый шаг к большим идеям", "Үлкен идеяларға алғашқы қадам")}</span></p>{step < 4 ? <button type="button" className="trial-next" disabled={!ready} onClick={next}>{step === 3 ? t("Подготовить сообщение", "Хабарлама дайындау") : t("Далее", "Әрі қарай")}<ArrowRight size={18} /></button> : <button type="button" className="trial-next trial-edit" onClick={() => setStep(0)}>{t("Изменить данные", "Мәліметтерді өзгерту")}</button>}</div></footer>
  </main>
}
