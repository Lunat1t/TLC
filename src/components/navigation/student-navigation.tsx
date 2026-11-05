"use client"

import { useRef } from "react"
import { BookOpen, FolderOpen } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode, TouchEvent } from "react"
import "./student-navigation.css"

type TouchOrigin = { x: number; y: number } | null

export function StudentNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const touchOrigin = useRef<TouchOrigin>(null)
  const onHome = pathname === "/"
  const inLibrary = pathname === "/instructions" || pathname.startsWith("/instructions/")
  const visible = onHome || inLibrary

  function navigate(target: "/" | "/instructions") {
    if (pathname !== target) router.push(target)
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!visible || event.touches.length !== 1) {
      touchOrigin.current = null
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest("a,button,input,select,textarea,[contenteditable=true],[data-swipe-ignore]")) {
      touchOrigin.current = null
      return
    }

    const touch = event.touches[0]
    touchOrigin.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const origin = touchOrigin.current
    touchOrigin.current = null
    if (!origin || !visible) return

    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - origin.x
    const deltaY = touch.clientY - origin.y
    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return

    if (deltaX < 0 && onHome) navigate("/instructions")
    if (deltaX > 0 && inLibrary) navigate("/")
  }

  return (
    <div
      className="tlc-student-navigation-root"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchOrigin.current = null }}
    >
      {children}
      {visible && (
        <nav className="tlc-bottom-nav" aria-label="Навигация TLC">
          <button
            type="button"
            className={`tlc-bottom-nav-item${onHome ? " is-active" : ""}`}
            aria-label="Проекты"
            aria-current={onHome ? "page" : undefined}
            onClick={() => navigate("/")}
          >
            <FolderOpen size={22} strokeWidth={2} aria-hidden="true" />
            <span>Проекты</span>
          </button>
          <button
            type="button"
            className={`tlc-bottom-nav-item${inLibrary ? " is-active" : ""}`}
            aria-label="Инструкции"
            aria-current={inLibrary ? "page" : undefined}
            onClick={() => navigate("/instructions")}
          >
            <BookOpen size={22} strokeWidth={2} aria-hidden="true" />
            <span>Инструкции</span>
          </button>
        </nav>
      )}
    </div>
  )
}
