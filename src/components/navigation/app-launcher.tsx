"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { BookOpen, FilePlus2, Map, Plus, type LucideIcon } from "lucide-react"
import { isNavPathActive, type NavIconKey, type NavItem } from "@/lib/navigation-shell"
import { useRouteWarmup } from "@/components/auth/app-startup"

const EXTRA_ICONS: Partial<Record<NavIconKey, LucideIcon>> = {
  instructions: BookOpen,
  "add-instruction": FilePlus2,
  "roadmap-admin": Map,
}

export function AppLauncher({ apps }: { apps: NavItem[] }) {
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const path = usePathname()
  const warm = useRouteWarmup()

  useEffect(() => {
    setOpen(false)
  }, [path])

  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false)
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  const hasActiveRoute = apps.some((app) => isNavPathActive(path, app.path))

  return (
    <div ref={root} className="studio-plus-wrap">
      <button
        ref={trigger}
        type="button"
        className="studio-plus-btn"
        data-route-active={hasActiveRoute ? "true" : "false"}
        aria-label={open ? "Закрыть остальные разделы" : "Остальные разделы"}
        title="Остальные разделы"
        aria-expanded={open}
        aria-controls="studio-plus-menu"
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <motion.span
          className="studio-plus-icon"
          animate={{ rotate: open ? 45 : 0 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 460, damping: 28 }}
        >
          <Plus size={19} aria-hidden="true" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="studio-plus-menu"
            role="menu"
            aria-label="Остальные разделы"
            className="studio-plus-menu"
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.97 }}
            transition={reduced ? { duration: 0 } : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="studio-plus-heading">Разделы</div>
            {apps.map((app) => {
              const Icon = EXTRA_ICONS[app.iconKey] ?? BookOpen
              const active = isNavPathActive(path, app.path)
              return (
                <Link
                  key={app.path}
                  href={app.path}
                  role="menuitem"
                  className="studio-plus-link"
                  aria-current={active ? "page" : undefined}
                  onPointerEnter={() => warm(app.path)}
                  onFocus={() => warm(app.path)}
                  onClick={() => setOpen(false)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{app.label}</span>
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
