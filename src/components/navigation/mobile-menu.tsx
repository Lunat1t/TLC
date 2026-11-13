"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, type LucideIcon } from "lucide-react"

type MenuPage = { path: string; label: string; icon: LucideIcon }

export function MobileMenu({ pages }: { pages: MenuPage[] }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape) }
  }, [open])

  return <div ref={container} className="mobile-menu">
    <button type="button" className="mobile-header-button" aria-label="Открыть меню" aria-expanded={open} aria-controls="mobile-page-menu" onClick={() => setOpen(value => !value)}><Menu size={25} aria-hidden="true" /></button>
    {open && <nav id="mobile-page-menu" className="mobile-menu-panel" aria-label="Разделы сайта">
      {pages.map(page => <Link key={page.path} href={page.path} aria-current={pathname === page.path || (page.path === "/instructions" && pathname.startsWith("/instructions/")) ? "page" : undefined} onClick={() => setOpen(false)}><page.icon size={20} aria-hidden="true" />{page.label}</Link>)}
    </nav>}
  </div>
}
