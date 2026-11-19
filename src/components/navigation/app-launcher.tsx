"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, Search, type LucideIcon } from "lucide-react"

type App = { path: string; label: string; icon: LucideIcon; color: string }

export function AppLauncher({ apps }: { apps: App[] }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const path = usePathname()
  useEffect(() => setOpen(false), [path])
  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape)
    }
  }, [open])
  const visible = apps.filter(app => app.label.toLowerCase().includes(query.trim().toLowerCase()))
  return <div ref={root} className="studio-more">
    <button ref={trigger} type="button" aria-label={open ? "Закрыть приложения" : "Все приложения"} aria-expanded={open}
      aria-controls="studio-apps" onClick={() => { setQuery(""); setOpen(!open) }}><Plus size={24} /></button>
    {open && <div id="studio-apps" className="studio-apps">
      <label><Search size={16} /><input type="search" aria-label="Найти приложение" placeholder="Поиск приложений" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div className="studio-app-grid">{visible.map(app =>
        <Link key={app.path} href={app.path} aria-current={path === app.path ? "page" : undefined} onClick={() => setOpen(false)}>
          <app.icon size={23} aria-hidden="true" /><span>{app.label}</span>
        </Link>)}</div>
      {!visible.length && <p role="status">Ничего не найдено</p>}
    </div>}
  </div>
}
