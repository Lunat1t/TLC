"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { GripHorizontal } from "lucide-react"

type Point = { x: number; y: number; z: number }
type Positions = Record<string, Point>
const CanvasContext = createContext<{ positions: Positions; place: (id: string, point: Point) => void; active: boolean }>({ positions: {}, place: () => {}, active: false })
export function DesktopCanvas({ userId, children }: { userId: string; children: ReactNode }) {
  const [positions, setPositions] = useState<Positions>({})
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")
  const key = `tlc-desktop-layout-v1:${userId}`
  const rawRef = useRef<string | null>(null)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key); rawRef.current = raw
      if (raw) {
        const data: unknown = JSON.parse(raw)
        if (!data || typeof data !== "object" || Array.isArray(data)) throw Error()
        const clean: Positions = {}
        for (const [id, p] of Object.entries(data)) {
          if (p && typeof p === "object" && [p.x,p.y,p.z].every(Number.isFinite)) clean[id] = {x:Math.min(1,Math.max(0,p.x)),y:Math.min(1,Math.max(0,p.y)),z:Math.min(999,Math.max(1,p.z))}
        }
        setPositions(clean)
      }
      setActive(true)
    } catch { setError("Не удалось загрузить расстановку. Исходные данные сохранены.") }
  }, [key])
  function place(id: string, point: Point) {
    if (!active) return
    const next = { ...positions, [id]: point }
    try {
      if (localStorage.getItem(key) !== rawRef.current) throw Error("Расстановка изменена в другой вкладке. Обновите страницу.")
      const raw = JSON.stringify(next); localStorage.setItem(key,raw); rawRef.current=raw; setPositions(next); setError("")
    } catch (e) { setError(e instanceof Error && e.message ? e.message : "Не удалось сохранить расстановку.") }
  }
  return <CanvasContext.Provider value={{positions,place,active}}><div className="desktop-canvas" data-swipe-ignore>{children}</div>{error && <p className="desktop-save-error" role="alert">{error}</p>}</CanvasContext.Provider>
}
export function DesktopItem({ id, label, initial, children, className = "", mobileInitial }: { mobileInitial?: [number,number]; id: string; label: string; initial: [number,number]; children: ReactNode; className?: string }) {
  const {positions,place,active} = useContext(CanvasContext)
  const node = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; x: number; y: number; startX: number; startY: number; point: Point } | null>(null)
  const [size, setSize] = useState({w:0,h:0,mobile:false})
  const [moving, setMoving] = useState<Point | null>(null)
  const systemMobile: Record<string,[number,number]> = {avatar:[.02,.02],clock:[.98,.02],projects:[0,.42],instructions:[.5,.42],profile:[1,.42]}
  const origin = size.mobile ? mobileInitial || systemMobile[id] || initial : initial
  const p = moving || positions[id] || {x:origin[0],y:origin[1],z:1}
  useEffect(() => {
    const element=node.current, parent=element?.parentElement
    if (!element || !parent) return
    const measure=()=>setSize({w:Math.max(0,parent.clientWidth-element.offsetWidth),h:Math.max(0,parent.clientHeight-element.offsetHeight),mobile:parent.clientWidth<700})
    const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(parent);measure()
    return ()=>observer.disconnect()
  }, [])
  const clamp=(x:number,y:number):Point=>({x:Math.min(1,Math.max(0,x)),y:Math.min(1,Math.max(0,y)),z:Math.min(999,Math.max(1,...Object.values(positions).map(v=>v.z))+1)})
  return <div ref={node} data-desktop-id={id} data-desktop-label={label} className={`desktop-item ${className}${moving ? " is-moving" : ""}`} style={{left:p.x*size.w,top:p.y*size.h,zIndex:p.z}}>
    <button className="desktop-drag-handle" disabled={!active} aria-label={`Переместить: ${label}`} title="Перетащите или используйте стрелки клавиатуры" onPointerDown={e=>{
      if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
      const point=clamp(p.x,p.y);drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:p.x*size.w,startY:p.y*size.h,point};setMoving(point)
    }} onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const point=clamp(size.w?(d.startX+e.clientX-d.x)/size.w:0,size.h?(d.startY+e.clientY-d.y)/size.h:0);d.point=point;setMoving(point)}} onPointerUp={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;place(id,d.point);drag.current=null;setMoving(null);e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null;setMoving(null)}} onKeyDown={e=>{
      const d:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!d[e.key])return;e.preventDefault();const step=e.shiftKey?40:10;place(id,clamp(p.x+d[e.key][0]*step/(size.w||1),p.y+d[e.key][1]*step/(size.h||1)))
    }}><GripHorizontal size={18}/><span>{label}</span></button>{children}
  </div>
}
