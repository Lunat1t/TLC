"use client"

import { useEffect, useRef, useState } from "react"
import { Flame, Ticket, X } from "lucide-react"
import "./activity-status.css"

type Activity = { balance: number; streak: number; multiplier: number; lastActiveOn: string }
const amount = (value: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value)

export function ActivityStatus({ userId }: { userId: string }) {
  const [activity, setActivity] = useState<Activity | null>(null)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let alive = true, running = false, claimedDay = ""
    const controller = new AbortController()
    async function refresh() {
      if (document.visibilityState !== "visible" || running || claimedDay === new Date().toISOString().slice(0, 10)) return
      running = true
      try {
        const response = await fetch("/api/activity", { method: "POST", signal: controller.signal, cache: "no-store" })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message || "Не удалось загрузить активность.")
        if (result.userId !== userId) throw new Error("Аккаунт изменился. Обновите страницу.")
        if (alive) { setActivity(result); setError(""); claimedDay = result.lastActiveOn }
      } catch (e) {
        if (alive && !controller.signal.aborted) setError(e instanceof Error ? e.message : "Не удалось загрузить активность.")
      } finally { running = false }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 60_000)
    document.addEventListener("visibilitychange", refresh)
    return () => { alive = false; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", refresh) }
  }, [userId, retry])

  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])

  return <>
    <div className="activity-status" aria-label="Баланс и ежедневная активность">
      <button className="activity-balance" onClick={() => setOpen(true)} aria-label={`Технономиналы: ${activity ? amount(activity.balance) : "загрузка"}`}>
        <span className="activity-ticket"><Ticket size={23} aria-hidden="true" /></span>
        <span><strong>{activity ? amount(activity.balance) : "—"}</strong><small>Технономиналы</small></span>
      </button>
      <button className={`activity-streak${activity ? " is-active" : ""}`} onClick={() => setOpen(true)} aria-label={`Стрик: ${activity?.streak ?? "—"}. Бонус ×${activity?.multiplier.toFixed(1) ?? "—"}`}>
        <Flame className="activity-flame" size={30} aria-hidden="true" />
        <span><strong>{activity?.streak ?? "—"}<small>Стрик</small></strong><span className="activity-multiplier">×{activity?.multiplier.toFixed(1) ?? "—"}</span></span>
        {error && <span aria-label="Ошибка загрузки">!</span>}
      </button>
    </div>
    <dialog ref={dialog} className="activity-dialog" onClose={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="activity-dialog-body">
        <button className="activity-close" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={22}/></button>
        <Flame size={44} className="activity-flame" aria-hidden="true" />
        <h2>Огонёк активности</h2>
        <p>Заходи каждый день и увеличивай бонус к технономиналам.</p>
        <div className="activity-steps"><span>1 день <b>×1.1</b></span><span>2 дня <b>×1.2</b></span><span>3 дня <b>×1.3</b></span></div>
        <p>Каждый день серии добавляет 0.1 к множителю. Ежедневная награда — 1 технономинал × бонус. Пропуск дня начинает серию заново, накопленный баланс сохраняется.</p>
        <small>Новый день начинается в 00:00 UTC. Повторный вход за день не меняет серию и баланс.</small>
        {activity && <p className="activity-earned">Сегодня: +{amount(activity.multiplier)} · Баланс: {amount(activity.balance)}</p>}
        {error && <div role="alert"><p>{error}</p><button className="activity-retry" onClick={() => { setError(""); setRetry(value => value + 1) }}>Повторить</button></div>}
      </div>
    </dialog>
  </>
}
