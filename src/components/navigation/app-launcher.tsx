"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Plus, type LucideIcon } from "lucide-react"

type App = { path: string; label: string; icon: LucideIcon; color: string }

export function AppLauncher({ apps }: { apps: App[] }) {
  const [open, setOpen] = useState(false)
  const reduced = useReducedMotion()
  const travel = useSpring(0, { stiffness: 440, damping: 29, mass: 0.85 })
  useEffect(() => {
    const target = open ? 1 : 0
    if (reduced) travel.jump(target)
    else travel.set(target)
  }, [open, reduced, travel])
  // Pinch across the short axis midway through the change of shape.
  const breadth = useTransform(travel, p => 1 - 0.28 * Math.sin(Math.PI * p))
  const length = useTransform(travel, p => 0.22 + 0.78 * p)
  const opacity = useTransform(travel, [0, 0.14, 0.32], [0, 0.8, 1])
  const rotation = useTransform(travel, p => p * 45)
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
    <motion.button whileTap={reduced ? undefined : { scale: 0.88 }} transition={{ type: "spring", stiffness: 520, damping: 20 }} ref={trigger} type="button" aria-label={open ? "Закрыть приложения" : "Все приложения"} aria-expanded={open}
      aria-controls="studio-apps" onClick={() => setOpen(value => !value)}><motion.span style={{ rotate: rotation }}><Plus size={24} /></motion.span></motion.button>
    <motion.div style={{ "--breadth": breadth, "--length": length, opacity } as import("framer-motion").MotionStyle} id="studio-apps" className="studio-apps" data-open={open} inert={!open} aria-hidden={!open}>
      <div className="studio-app-grid">{apps.map(app =>
        <Link key={app.path} href={app.path} aria-current={path === app.path ? "page" : undefined} onClick={() => setOpen(false)}>
          <app.icon size={23} aria-hidden="true" /><span>{app.label}</span>
        </Link>)}</div>
    </motion.div>
  </div>
}
