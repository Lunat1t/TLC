"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, type LucideIcon } from "lucide-react"

type App = { path: string; label: string; icon: LucideIcon; color: string }

export function AppLauncher({ apps }: { apps: App[] }) {
  const [open, setOpen] = useState(false)
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
  return <div ref={root} className="studio-more">
    <button ref={trigger} type="button" aria-label={open ? "Закрыть приложения" : "Все приложения"} aria-expanded={open}
      aria-controls="studio-apps" onClick={() => setOpen(value => !value)}><Plus size={24} /></button>
    <div id="studio-apps" className="studio-apps" data-open={open} inert={!open} aria-hidden={!open}>
      <div className="studio-app-grid">{apps.map(app =>
        <Link key={app.path} href={app.path} aria-current={path === app.path ? "page" : undefined} onClick={() => setOpen(false)}>
          <app.icon size={23} aria-hidden="true" /><span>{app.label}</span>
        </Link>)}</div>
    </div>
  </div>
}
