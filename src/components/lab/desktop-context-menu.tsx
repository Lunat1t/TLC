"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { CircleMenu } from "@/components/ui/circle-menu"
import { FileCode2, Globe, StickyNote, ImagePlus, FolderOpen } from "lucide-react"

type Actions = { onShortcut: () => void; onNote: () => void; onProject?: () => void; onImage:()=>void; canPin: boolean }

export function DesktopContextMenu({ children, onShortcut, onNote, onProject, onImage, canPin }: Actions & { children: ReactNode }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; pointer: number } | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  function cancelHold() {
    if (pending.current) clearTimeout(pending.current.timer)
    pending.current = null
  }
  function open(x: number, y: number) {
    cancelHold()
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Keep the entire radial menu inside the visible viewport.
    setPoint({ x: Math.max(165, Math.min(window.innerWidth - 165, x)), y: Math.max(165, Math.min(window.innerHeight - 165, y)) })
  }
  function close(restoreFocus = false) {
    setPoint(null)
    if (restoreFocus) (previousFocus.current?.isConnected ? previousFocus.current : surface.current)?.focus({ preventScroll: true })
  }
  useEffect(() => {
    function move(event: PointerEvent) {
      const hold = pending.current
      if (hold && (event.pointerId !== hold.pointer || Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10)) cancelHold()
    }
    function dismiss() { cancelHold(); setPoint(null) }
    document.addEventListener("pointermove", move, { passive: true })
    document.addEventListener("pointerup", cancelHold)
    document.addEventListener("pointercancel", cancelHold)
    window.addEventListener("scroll", dismiss, true)
    window.addEventListener("resize", dismiss)
    window.addEventListener("blur", dismiss)
    return () => {
      cancelHold()
      document.removeEventListener("pointermove", move)
      document.removeEventListener("pointerup", cancelHold)
      document.removeEventListener("pointercancel", cancelHold)
      window.removeEventListener("scroll", dismiss, true)
      window.removeEventListener("resize", dismiss)
      window.removeEventListener("blur", dismiss)
    }
  }, [])
  useEffect(() => {
    if (!point) return
    menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true })
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setPoint(null)
    }
    document.addEventListener("pointerdown", outside)
    return () => document.removeEventListener("pointerdown", outside)
  }, [point])

  return <div ref={surface} className="desktop-context-surface" tabIndex={0} aria-label="Рабочий стол. Меню действий: Shift+F10" onContextMenu={event => {
    if (!(event.target instanceof Element) || !event.target.matches(".desktop-canvas, .desktop-context-surface")) return
    event.preventDefault()
    open(event.clientX, event.clientY)
  }} onPointerDown={event => {
    cancelHold()
    if (event.button !== 0 || !event.isPrimary || !(event.target instanceof Element) || !event.target.matches(".desktop-canvas, .desktop-context-surface")) return
    const { clientX: x, clientY: y, pointerId: pointer } = event
    pending.current = { x, y, pointer, timer: setTimeout(() => open(x, y), 600) }
  }} onKeyDown={event => {
    if (event.target !== event.currentTarget || !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))) return
    event.preventDefault()
    const bounds = event.currentTarget.getBoundingClientRect()
    open(bounds.left + bounds.width / 2, Math.max(150, bounds.top + 150))
  }}>
    {children}
    {point && createPortal(<div ref={menu} className="desktop-action-menu" role="dialog" aria-label="Действия рабочего стола" style={{ left: point.x, top: point.y }} onContextMenu={event => event.preventDefault()} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true) }
      if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(event.key)) {
        event.preventDefault()
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(index + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPoint(null) }}>
      <CircleMenu defaultOpen onClose={()=>close(true)} items={[
        { label: "Ярлык", color:"#8b5bd9", icon: <Globe size={28} aria-hidden="true"/>, disabled: !canPin, onSelect: ()=>{close();onShortcut()} },
        { label: "Заметка", color:"#ca8a04", icon: <StickyNote size={28} aria-hidden="true"/>, disabled: !canPin, onSelect: ()=>{close();onNote()} },
        ...(onProject ? [{ label: "Программа", color:"#2875e8", icon: <FileCode2 size={28} aria-hidden="true"/>, onSelect: ()=>{close();onProject()} }] : []),
        {label:"Картинка",color:"#df5970",icon:<ImagePlus size={28}/>,disabled:!canPin,onSelect:()=>{close();onImage()}},
        {label:"Файлы",color:"#218573",icon:<FolderOpen size={28}/>,onSelect:()=>{close();window.location.assign("/files")}},
      ]}/>

    </div>, document.body)}
  </div>
}
