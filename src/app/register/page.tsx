"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Blocks, Bot, Check, Code2, Cpu, GraduationCap, Heart, KeyRound, Smile, Sparkles, UserRound } from "lucide-react"
import { registerStudentWithSupabase } from "@/lib/auth"
import { createClient } from "@/utils/supabase/client"
import { fullNameLogin, validateAccountPassword } from "@/lib/account-credentials"
import "./onboarding.css"

const courses = [
  { id: "wedo", name: "LEGO WeDo", description: "Первые роботы", kk: "Алғашқы роботтар", icon: Blocks, color: "coral" },
  { id: "spike", name: "LEGO SPIKE", description: "Собирай и оживляй", kk: "Құрастыр және жандандыр", icon: Bot, color: "yellow" },
  { id: "ev3", name: "LEGO EV3", description: "Роботы посложнее", kk: "Күрделірек роботтар", icon: Cpu, color: "blue" },
  { id: "arduino", name: "Arduino", description: "Мир электроники", kk: "Электроника әлемі", icon: Cpu, color: "mint" },
  { id: "code", name: "Программи\u00adрование", kkName: "Бағдарламалау", description: "Создавай своё", kk: "Өзің жасап көр", icon: Code2, color: "lilac" },
] as const
const roles = [
  { id: "student", name: "Я ученик", kk: "Мен оқушымын", description: "Хочу учиться и создавать", kkDescription: "Үйреніп, жасағым келеді", icon: Smile, color: "yellow" },
  { id: "teacher", name: "Я учитель", kk: "Мен мұғаліммін", description: "Помогаю открывать новое", kkDescription: "Жаңалық ашуға көмектесемін", icon: GraduationCap, color: "blue" },
  { id: "parent", name: "Я родитель", kk: "Мен ата-анамын", description: "Поддерживаю юного изобретателя", kkDescription: "Жас өнертапқышқа қолдау көрсетемін", icon: Heart, color: "coral" },
] as const
const options = ["LEGO WeDo", "LEGO SPIKE", "LEGO EV3", "VEX"]
type Role = typeof roles[number]["id"]

export default function RegisterPage() {
  const router = useRouter()
  const [language, setLanguage] = React.useState<"ru" | "kk">("ru")
  const [course, setCourse] = React.useState("")
  const [role, setRole] = React.useState<Role | null>(null)
  const [step, setStep] = React.useState(0)
  const [disciplines, setDisciplines] = React.useState<string[]>([])
  const [name, setName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [age, setAge] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [googleUser, setGoogleUser] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const heading = React.useRef<HTMLHeadingElement>(null)
  const kk = language === "kk"
  const t = (ru: string, kz: string) => kk ? kz : ru

  React.useEffect(() => {
    if (localStorage.getItem("tlc.site-language") === "kk") setLanguage("kk")
    const token = new URLSearchParams(window.location.search).get("student")
    if (token && /^[0-9a-f-]{36}$/i.test(token)) sessionStorage.setItem("tlc.pending-student", token)
    void createClient().auth.getUser().then(({ data }) => setGoogleUser(!!data.user)).catch(() => {})
  }, [])
  React.useEffect(() => { heading.current?.focus() }, [step])

  const steps = ["course", "role", ...(role === "teacher" ? ["disciplines"] : []), "name", ...(role === "parent" ? [] : ["age"]), "password"]
  const loginPreview = name.trim() && lastName.trim() ? `${name.trim()}_${lastName.trim()}` : ""
  const current = steps[step]
  const titles: Record<string, string> = {
    course: t("Что хочешь изучать?", "Нені үйренгің келеді?"),
    role: t("Давай познакомимся!", "Танысайық!"),
    disciplines: t("Чему вы учите?", "Нені үйретесіз?"),
    name: t("Как тебя зовут?", "Есімің кім?"),
    age: t("Сколько тебе лет?", "Жасың нешеде?"),
    password: t("Придумай пароль", "Құпиясөз ойлап тап"),
  }
  const hints: Record<string, string> = {
    course: t("Выбери то, что тебе интересно. С этого и начнём!", "Өзіңе қызықтысын таңда. Содан бастаймыз!"),
    role: t("Здесь рады и детям, и взрослым.", "Мұнда балаларға да, ересектерге де қуаныштымыз."),
    disciplines: t("Можно выбрать несколько направлений.", "Бірнеше бағытты таңдауға болады."),
    name: t("Напиши имя и фамилию английскими буквами. Мы объединим их в логин.", "Есімің мен тегіңді ағылшын әріптерімен жаз. Оларды біріктіріп, логин жасаймыз."),
    age: t("Так мы узнаем тебя чуть лучше.", "Осылайша сені жақынырақ танимыз."),
    password: t("Не меньше 8 символов. Лучше несколько слов, которые легко запомнить.", "Кемінде 8 таңба. Есте сақтауға оңай бірнеше сөз таңда."),
  }
  const ready = current === "course" ? !!course : current === "role" ? !!role : current === "disciplines" ? !!disciplines.length : current === "name" ? !!name.trim() && !!lastName.trim() : current === "age" ? !!age : password.length >= 8

  async function next(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    if (!ready || busy) return
    if (current === "name") { try { fullNameLogin(name, lastName) } catch (e) { setError(e instanceof Error ? e.message : "Проверь имя и фамилию."); return } }
    if (current === "age" && (!/^\d{1,3}$/.test(age) || Number(age) < 1 || Number(age) > 120)) { setError(t("Введи возраст от 1 до 120 лет.", "1 мен 120 аралығындағы жасты енгіз.")); return }
    if (current !== "password") { setStep(step + 1); return }
    let login: string
    try { login = fullNameLogin(name, lastName); validateAccountPassword(password) } catch (e) { setError(e instanceof Error ? e.message : "Проверь данные."); return }
    setBusy(true)
    try {
      if (googleUser) {
        const client = createClient()
        const { error: passwordError } = await client.auth.updateUser({ password, data: { login, nickname: `${name.trim()} ${lastName.trim()}`, first_name: name.trim(), last_name: lastName.trim() } })
        if (passwordError) throw passwordError
        const { error } = await client.rpc("complete_tlc_onboarding", { p_login: login, p_age: role === "parent" ? null : Number(age), p_role: role, p_disciplines: role === "teacher" ? disciplines : [] })
        if (error) throw error
      } else await registerStudentWithSupabase(localStorage, { login, firstName: name, lastName, password, age: role === "parent" ? null : Number(age), role: role!, disciplines: role === "teacher" ? disciplines : [] })
      localStorage.setItem("tlc.learning-interest", course)
      router.replace(role === "parent" ? "/profile" : "/dashboard")
      router.refresh()
    } catch (e) { setError(e instanceof Error ? e.message : t("Не удалось создать аккаунт. Попробуй ещё раз.", "Аккаунт жасау мүмкін болмады. Қайта көр.")) }
    finally { setBusy(false) }
  }

  return <main className="onboarding" lang={language}>
    <header className="onboarding-header">
      <Link href="/" className="onboarding-logo" aria-label="Techlab">techlab</Link>
      <Link href="/login" className="onboarding-login">{t("Уже есть аккаунт?", "Аккаунтың бар ма?")}</Link>
    </header>
    <div className="onboarding-track">
      <button type="button" className="onboarding-back" disabled={busy} aria-label={t("Назад", "Артқа")} onClick={() => { if (step === 0) router.push("/"); else { setStep(step - 1); setError("") } }}><ArrowLeft size={24} /></button>
      <div className="onboarding-progress" role="progressbar" aria-label={t("Знакомство", "Танысу")} aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={step + 1} aria-valuetext={`${step + 1} / ${steps.length}`}><span style={{ transform: `scaleX(${(step + 1) / steps.length})` }} /></div>
      <span className="onboarding-count">{step + 1}<span> / {steps.length}</span></span>
    </div>
    <form onSubmit={next} className="onboarding-form">
      <section className={`onboarding-content ${current === "course" ? "onboarding-content-wide" : ""}`} aria-labelledby="onboarding-title">
        <div className="onboarding-title-group">
          <h1 id="onboarding-title" ref={heading} tabIndex={-1}>{titles[current]}</h1>
          <p id="onboarding-hint">{hints[current]}</p>
        </div>
        {current === "course" && <div className="onboarding-courses" role="group" aria-label={titles.course}>{courses.map(item => <button key={item.id} type="button" className={`onboarding-choice course-choice ${course === item.id ? "is-selected" : ""}`} aria-pressed={course === item.id} onClick={() => { setCourse(item.id); setError("") }}>
          <span className={`onboarding-art art-${item.color}`}><item.icon size={48} strokeWidth={2.4} aria-hidden="true" /></span>
          <strong>{kk && "kkName" in item ? item.kkName : item.name}</strong><span className="choice-description">{kk ? item.kk : item.description}</span>
          {course === item.id && <Check className="choice-check" size={20} aria-hidden="true" />}
        </button>)}</div>}
        {current === "role" && <div className="onboarding-roles" role="group" aria-label={titles.role}>{roles.map(item => <button key={item.id} type="button" className={`onboarding-choice role-choice ${role === item.id ? "is-selected" : ""}`} aria-pressed={role === item.id} onClick={() => { setRole(item.id); setError("") }}><span className={`onboarding-art art-${item.color}`}><item.icon size={32} aria-hidden="true" /></span><span><strong>{kk ? item.kk : item.name}</strong><span className="choice-description">{kk ? item.kkDescription : item.description}</span></span>{role === item.id && <Check className="choice-check" size={20} aria-hidden="true" />}</button>)}</div>}
        {current === "disciplines" && <div className="onboarding-roles" role="group" aria-label={titles.disciplines}>{options.map(item => <button key={item} type="button" className={`onboarding-choice discipline-choice ${disciplines.includes(item) ? "is-selected" : ""}`} aria-pressed={disciplines.includes(item)} onClick={() => setDisciplines(old => old.includes(item) ? old.filter(v => v !== item) : [...old, item])}><Blocks size={26} aria-hidden="true" /><strong>{item}</strong><span className="discipline-check">{disciplines.includes(item) && <Check size={18} />}</span></button>)}</div>}
        {current === "name" && <div className="onboarding-answer">
          <span className="onboarding-art answer-art art-blue"><UserRound size={54} aria-hidden="true" /></span>
          <label htmlFor="first-name">{t("Имя", "Есім")}</label>
          <input id="first-name" autoFocus autoComplete="given-name" maxLength={30} value={name} onChange={e => { setName(e.target.value); setError("") }} placeholder="Alua" aria-describedby="onboarding-hint" aria-invalid={!!error} />
          <label className="onboarding-second-label" htmlFor="last-name">{t("Фамилия", "Тегі")}</label>
          <input id="last-name" autoComplete="family-name" maxLength={30} value={lastName} onChange={e => { setLastName(e.target.value); setError("") }} placeholder="Serik" aria-describedby="onboarding-hint" aria-invalid={!!error} />
          {loginPreview && <p className="onboarding-login-preview">{t("Твой логин", "Сенің логинің")}: <strong>{loginPreview}</strong></p>}
        </div>}
        {["age", "password"].includes(current) && <div className="onboarding-answer" key={current}>
          <span className={`onboarding-art answer-art art-${current === "password" ? "mint" : "yellow"}`}>{current === "password" ? <KeyRound size={54} aria-hidden="true" /> : <Sparkles size={54} aria-hidden="true" />}</span>
          <label htmlFor="onboarding-input">{current === "age" ? t("Твой возраст", "Сенің жасың") : t("Твой пароль", "Сенің құпиясөзің")}</label>
          <input id="onboarding-input" autoFocus value={current === "age" ? age : password} onChange={e => { if (current === "age") setAge(e.target.value.replace(/\D/g, "")); else setPassword(e.target.value); setError("") }} type={current === "password" ? "password" : "text"} inputMode={current === "age" ? "numeric" : "text"} maxLength={current === "age" ? 3 : 72} autoComplete={current === "password" ? "new-password" : "off"} placeholder={current === "age" ? "10" : t("Не меньше 8 символов", "Кемінде 8 таңба")} aria-describedby={error ? "onboarding-error onboarding-hint" : "onboarding-hint"} aria-invalid={!!error} disabled={busy} />
          {current === "password" && <p className="onboarding-login-preview">{t("Твой логин", "Сенің логинің")}: <strong>{loginPreview}</strong></p>}
        </div>}
        {error && <p id="onboarding-error" role="alert" className="onboarding-error">{error}</p>}
      </section>
      <footer className="onboarding-footer"><div><p>{t("Знакомство", "Танысу")}<span>{t("Маленький шаг к большим идеям", "Үлкен идеяларға шағын қадам")}</span></p><button className="onboarding-next" type="submit" disabled={busy || !ready}>{busy ? t("Сохраняем…", "Сақталуда…") : current === "password" ? t("Начать учиться", "Оқуды бастау") : t("Далее", "Әрі қарай")}</button></div></footer>
    </form>
  </main>
}
