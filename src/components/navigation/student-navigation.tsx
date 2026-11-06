"use client"

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react"
import { useAccess } from "@/components/auth/access-provider"
import { ArrowDown, ArrowUp, BookOpen, Check, FolderOpen, GripVertical, FilePlus2, Move, RotateCcw, Settings, UserRound, X } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, TouchEvent } from "react"
import { defaultNavigationLayout, navigationPages, reconcilePageOrder, moveNavigationPage, dockNavigationLayout, navigationDock, layoutAtPosition, layoutPosition, NAVIGATION_LAYOUT_KEY, readNavigationLayout, type LayoutBounds, type NavigationLayout, type PageId } from "@/lib/navigation-layout"
import "./student-navigation.css"

const pages = {
  projects: { label: "Проекты", path: "/dashboard", icon: FolderOpen },
  "add-instruction": { label: "Добавить инструкцию", path: "/admin/instructions/drive", icon: FilePlus2 },
  instructions: { label: "Инструкции", path: "/instructions", icon: BookOpen },
  avatar: { label: "Аватар", path: "/avatar", icon: UserRound },
} as const

type Drag = { pointerId: number; x: number; y: number; left: number; top: number; page?: PageId; moved: boolean }
export function StudentNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname(), router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [layout, setLayout] = useState<NavigationLayout>(defaultNavigationLayout)
  const [saved, setSaved] = useState<NavigationLayout>(defaultNavigationLayout)
  const [editing, setEditing] = useState(false), [menu, setMenu] = useState(false)
  const [message, setMessage] = useState("")
  const [geometry, setGeometry] = useState<{ bounds: LayoutBounds; width: number; height: number; reserved?: LayoutBounds } | null>(null)
  const nav = useRef<HTMLElement>(null), bounds = useRef<HTMLDivElement>(null), settings = useRef<HTMLDivElement>(null), gear = useRef<HTMLButtonElement>(null)
  const warmed = useRef(new Map<string, number>())
  const drag = useRef<Drag | null>(null)
  const touchOrigin = useRef<{ x: number; y: number } | null>(null)
  const onHome = pathname === "/dashboard", inLibrary = pathname === "/instructions" || pathname.startsWith("/instructions/"), onAvatar = pathname === "/avatar"
  const access = useAccess()
  const allowed = navigationPages(access.role, access.canPublish)
  const order = reconcilePageOrder(layout.order, allowed)
  const orderKey = order.join("|")
  const visible = allowed.length > 0 && (onHome || inLibrary || pathname === "/admin/instructions/drive" || onAvatar)
  const dock = navigationDock(layout)

  useEffect(() => {
    if (!visible) return
    for (const id of order) {
      const path = pages[id].path
      if (path !== pathname && Date.now() - (warmed.current.get(path) ?? 0) > 30_000) {
        warmed.current.set(path, Date.now())
        router.prefetch(path)
      }
    }
  }, [visible, pathname, orderKey, router])

  useEffect(() => {
    try { const initial = dockNavigationLayout(readNavigationLayout(localStorage.getItem(NAVIGATION_LAYOUT_KEY))); setLayout(initial); setSaved(initial) } catch { /* Defaults remain usable without browser storage. */ }
  }, [])
  useLayoutEffect(() => {
    if (!visible) return
    function measure() {
      if (!nav.current || !bounds.current) return
      const area = bounds.current.getBoundingClientRect(), panel = nav.current.getBoundingClientRect(), control = gear.current?.getBoundingClientRect()
      setGeometry({ bounds: { left: area.left, top: area.top, width: area.width, height: area.height }, width: panel.width, height: panel.height, reserved: control ? { left: control.left - 8, top: control.top - 8, width: control.width + 16, height: control.height + 16 } : undefined })
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (nav.current) observer.observe(nav.current)
    if (bounds.current) observer.observe(bounds.current)
    window.addEventListener("resize", measure)
    window.visualViewport?.addEventListener("resize", measure)
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.visualViewport?.removeEventListener("resize", measure) }
  }, [visible, editing, dock])

  function cancel() { setLayout(saved); setEditing(false); setMenu(false); setMessage(""); drag.current = null; gear.current?.focus() }
  function save() {
    try { localStorage.setItem(NAVIGATION_LAYOUT_KEY, JSON.stringify({...layout,order})); setSaved({...layout,order}); setEditing(false); setMenu(false); setMessage(""); gear.current?.focus() }
    catch { setMessage("Не удалось сохранить. Разрешите хранение данных в браузере.") }
  }
  useEffect(() => {
    function dismiss(event: globalThis.PointerEvent) { if (event.target instanceof Node && !settings.current?.contains(event.target) && !gear.current?.contains(event.target)) setMenu(false) }
    function escape(event: globalThis.KeyboardEvent) { if (event.key === "Escape") { setLayout(saved); setEditing(false); setMenu(false); drag.current = null; gear.current?.focus() } }
    if (menu) document.addEventListener("pointerdown", dismiss)
    if (menu || editing) document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape) }
  }, [menu, editing, saved])
  useEffect(() => { setMenu(false); setEditing(false); setLayout(saved); drag.current = null }, [pathname, saved])

  function startDrag(event: PointerEvent<HTMLButtonElement>, page?: PageId) {
    if (!editing || event.button !== 0 || !nav.current) return
    event.preventDefault()
    const rect = nav.current.getBoundingClientRect()
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, page, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current
    if (!active || event.pointerId !== active.pointerId || !geometry) return
    const dx = event.clientX - active.x, dy = event.clientY - active.y
    if (Math.hypot(dx, dy) < 5 && !active.moved) return
    active.moved = true
    if (active.page) {
      const target = Array.from(nav.current?.querySelectorAll<HTMLButtonElement>("[data-page]") ?? []).find(node => { const rect=node.getBoundingClientRect(); return event.clientX>=rect.left && event.clientX<=rect.right && event.clientY>=rect.top && event.clientY<=rect.bottom })
      const targetId=target?.dataset.page as PageId | undefined
      if (targetId && targetId!==active.page) setLayout(old => ({...old, order:moveNavigationPage(reconcilePageOrder(old.order,allowed), order.indexOf(active.page!), order.indexOf(targetId))}))
    } else {
      setLayout(old => dockNavigationLayout(layoutAtPosition(old, active.left + dx, active.top + dy, geometry.bounds, geometry), geometry.bounds))
    }
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>) { if (drag.current?.pointerId === event.pointerId) { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) } }
  function moveWithKeys(event: KeyboardEvent<HTMLButtonElement>) {
    if (!editing || !geometry || !nav.current) return
    const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const delta = offsets[event.key]; if (!delta) return
    event.preventDefault()
    const rect = nav.current.getBoundingClientRect(), amount = event.shiftKey ? 40 : 10
    setLayout(old => dockNavigationLayout(layoutAtPosition(old, rect.left + delta[0] * amount, rect.top + delta[1] * amount, geometry.bounds, geometry), geometry.bounds))
  }
  function navigate(page: PageId) { if (!editing && pathname !== pages[page].path) startTransition(() => router.push(pages[page].path)) }
  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!visible || editing || event.touches.length !== 1 || (event.target instanceof Element && event.target.closest("a,button,input,select,textarea,[contenteditable=true],[data-swipe-ignore]"))) { touchOrigin.current = null; return }
    touchOrigin.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }
  }
  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const origin = touchOrigin.current; touchOrigin.current = null
    if (!origin || !visible || editing || !event.changedTouches[0]) return
    const dx = event.changedTouches[0].clientX - origin.x, dy = event.changedTouches[0].clientY - origin.y
    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.25) return
    const current: PageId = onHome ? "projects" : inLibrary ? "instructions" : onAvatar ? "avatar" : "add-instruction", index = order.indexOf(current), target = order[index + (dx < 0 ? 1 : -1)]
    if (target) navigate(target)
  }
  const position = geometry ? layoutPosition(layout, geometry.bounds, geometry, geometry.reserved) : null
  const style: CSSProperties | undefined = position ? { left: position.left, top: position.top, bottom: "auto", transform: "none" } : undefined
  const railSize = layout.vertical ? (geometry?.width ?? 156) + 24 : Math.max(84, (geometry?.height ?? 60) + 24)
  const contentStyle: CSSProperties = { [dock]: railSize }
  return <div data-dock={visible ? dock : undefined} className="tlc-student-navigation-root" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onTouchCancel={() => { touchOrigin.current = null }}>
    <div className={visible ? "tlc-page-content tlc-page-transition" : "tlc-page-container"} style={visible ? contentStyle : undefined} aria-busy={isPending}>{children}</div>
    {isPending && <div className="tlc-navigation-progress" role="status">Загружаем страницу…</div>}
    {visible && <>
      {!onAvatar && <div className={`tlc-nav-rail dock-${dock}`} style={layout.vertical ? { width: railSize } : { height: railSize }} aria-hidden="true" />}
      {!onAvatar && <div ref={bounds} className={`tlc-layout-bounds${editing ? " is-editing" : ""}`} aria-hidden="true" />}
      <nav ref={nav} style={style} className={`tlc-bottom-nav${layout.vertical ? " is-vertical" : ""}${editing ? " is-editing" : ""}${onAvatar ? " is-avatar-page" : ""}`} aria-label="Навигация TLC" data-swipe-ignore>
        {editing && <button type="button" className="tlc-nav-move" aria-label="Переместить панель" title="Перетащите панель или используйте стрелки клавиатуры" onPointerDown={e => startDrag(e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={moveWithKeys}><GripVertical size={20} aria-hidden="true" /></button>}
        {order.map(id => { const page = pages[id], active = id === "projects" ? onHome : id === "instructions" ? inLibrary : pathname === page.path; return <button key={id} data-page={id} type="button" className={`tlc-bottom-nav-item${active ? " is-active" : ""}`} aria-label={page.label} aria-current={active ? "page" : undefined} title={editing ? `${page.label}: перетащите для смены порядка` : page.label} onClick={() => navigate(id)} onPointerDown={e => startDrag(e, id)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><page.icon size={22} strokeWidth={2} aria-hidden="true" /><span>{page.label}</span></button> })}
      </nav>
      {!onAvatar && <button ref={gear} type="button" className={`tlc-layout-gear${editing ? " is-editing" : ""}`} aria-label="Настроить интерфейс" aria-expanded={menu} aria-controls="tlc-layout-settings" onClick={() => setMenu(!menu)}><Settings size={22} aria-hidden="true" /></button>}
      {!onAvatar && menu && <div ref={settings} id="tlc-layout-settings" className="tlc-layout-settings" role="dialog" aria-label="Настройка интерфейса" data-swipe-ignore>
        <div className="tlc-layout-settings-heading"><strong>{editing ? "Положение панели" : "Настройка интерфейса"}</strong><button type="button" aria-label="Закрыть настройки" onClick={() => { setMenu(false); gear.current?.focus() }}><X size={18} /></button></div>
        {!editing ? <><p>Расположи переключатель страниц так, как тебе удобно.</p><button type="button" className="tlc-layout-primary" onClick={() => { setEditing(true); setMenu(true); setMessage("") }}><Move size={18} />Изменить положение</button></> : <>
          <p>Тяни панель к нужному краю. Она сама повернётся и освободит место странице.</p>
          <div className="tlc-layout-orientation tlc-layout-edges" role="group" aria-label="Край панели">{([['left','Слева'],['top','Сверху'],['bottom','Снизу'],['right','Справа']] as const).map(([edge,label]) => <button type="button" key={edge} aria-pressed={dock===edge} onClick={() => setLayout(old => ({...old,vertical:edge==='left'||edge==='right',x:edge==='left'?0:edge==='right'?1:.5,y:edge==='top'?0:edge==='bottom'?1:.5}))}>{label}</button>)}</div>
          <span className="tlc-layout-label">Порядок страниц</span>
          <ol className="tlc-layout-order">{order.map((id, index) => <li key={id}><span>{pages[id].label}</span><button type="button" aria-label={`Переместить ${pages[id].label} раньше`} disabled={index === 0} onClick={() => setLayout(old => ({ ...old, order: moveNavigationPage(order, index, index - 1) }))}><ArrowUp size={17} /></button><button type="button" aria-label={`Переместить ${pages[id].label} позже`} disabled={index === order.length - 1} onClick={() => setLayout(old => ({ ...old, order: moveNavigationPage(order, index, index + 1) }))}><ArrowDown size={17} /></button></li>)}</ol>
          <button type="button" className="tlc-layout-reset" onClick={() => { setLayout(defaultNavigationLayout()); setMessage("") }}><RotateCcw size={16} />Вернуть как было сначала</button>
          {message && <p role="alert">{message}</p>}
          <div className="tlc-layout-actions"><button type="button" onClick={cancel}>Отмена</button><button type="button" className="tlc-layout-primary" onClick={save}><Check size={17} />Готово</button></div>
        </>}
      </div>}
    </>}
  </div>
}
