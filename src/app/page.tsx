"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import "./welcome.css"

type Language = "ru" | "kk"

const copy = {
  ru: {
    welcome: "Добро пожаловать",
    start: "Начать",
    account: "У меня уже есть аккаунт",
    services: "Наши услуги",
    items: ["LEGO WeDo", "LEGO SPIKE", "LEGO EV3", "Arduino", "Программирование"],
    language: "Язык сайта",
  },
  kk: {
    welcome: "Қош келдіңіз",
    start: "Бастау",
    account: "Менде аккаунт бар",
    services: "Біздің қызметтер",
    items: ["LEGO WeDo", "LEGO SPIKE", "LEGO EV3", "Arduino", "Бағдарламалау"],
    language: "Сайт тілі",
  },
} as const

export default function WelcomePage() {
  const [language, setLanguage] = useState<Language>("ru")

  useEffect(() => {
    const saved = window.localStorage.getItem("tlc.site-language")
    if (saved === "kk" || saved === "ru") setLanguage(saved)
  }, [])

  function changeLanguage(next: Language) {
    setLanguage(next)
    window.localStorage.setItem("tlc.site-language", next)
  }

  const text = copy[language]

  return (
    <main className="welcome-page" lang={language}>
      <header className="welcome-header">
        <Link href="/" className="welcome-logo" aria-label="TechLab">
          techlab
        </Link>
        <div className="welcome-language" role="group" aria-label={text.language}>
          <button type="button" aria-pressed={language === "kk"} onClick={() => changeLanguage("kk")}>Қазақша</button>
          <span aria-hidden="true" />
          <button type="button" aria-pressed={language === "ru"} onClick={() => changeLanguage("ru")}>Русский</button>
        </div>
      </header>

      <section className="welcome-main" aria-labelledby="welcome-title">
        <h1 id="welcome-title">{text.welcome}</h1>
        <div className="welcome-actions">
          <Link className="welcome-start" href="/register">{text.start}</Link>
          <Link className="welcome-login" href="/login">{text.account}</Link>
        </div>
      </section>

      <section className="welcome-services" aria-labelledby="services-title">
        <h2 id="services-title">{text.services}</h2>
        <ul>
          {text.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </main>
  )
}
