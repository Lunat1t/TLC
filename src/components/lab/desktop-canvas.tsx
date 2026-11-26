"use client"

import { Children, cloneElement, isValidElement, createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAccountWorkspace } from "./account-workspace"
import { workspaceValuesEqual } from "@/lib/workspace-sync"

type Point = { desktop?:number; x: number; y: number; z: number; locked?: boolean; title?: string }
type Positions = Record<string, Point>
const CanvasContext = createContext<{ positions: Positions; place: (id: string, point: Point, expected?: { point?: Point }) => void; active: boolean }>({ positions: {}, place: () => {}, active: false })
export function DesktopCanvas({ userId, children }: { userId: string; children: ReactNode }) {
  const [positions, setPositions] = useState<Positions>({})
  const [active, setActive] = useState(false)
  const [error, setError] = useState("")
  const store=useAccountWorkspace()
  useEffect(()=>{
    setActive(false)
    if(!store.ready)return
    try {
      const data=store.values.layout||{}
      if(typeof data!=='object'||Array.isArray(data))throw Error()
      const clean:Positions={}
      for(const [id,value] of Object.entries(data)){
        const p=value as Point
        if(p&&typeof p==='object'&&[p.x,p.y,p.z].every(Number.isFinite))clean[id]={desktop:Number.isInteger(p.desktop)?Math.max(0,Math.min(5,p.desktop!)):0,x:Math.min(1,Math.max(0,p.x)),y:Math.min(1,Math.max(0,p.y)),z:Math.min(999,Math.max(1,p.z)),locked:p.locked===true,title:typeof p.title==='string'?p.title.slice(0,64):undefined}
      }
      setPositions(clean);setActive(true);setError('')
    }catch{setError('Не удалось загрузить расстановку аккаунта.')}
  },[store.ready,store.values.layout])
  function place(id:string,point:Point,expected?:{point?:Point}){if(!active)return;if(expected&&!workspaceValuesEqual(expected.point,positions[id])){setError('Положение изменено на другом устройстве. Повторите перемещение из новой позиции.');return}const next={...positions,[id]:point};if(store.update('layout',next,store.values.layout||{})){setPositions(next);setError('')}}
  return <CanvasContext.Provider value={{positions,place,active}}><div className="desktop-canvas" data-swipe-ignore>{children}</div>{error && <p className="desktop-save-error" role="alert">{error}</p>}</CanvasContext.Provider>
}
export function DesktopItem({ id, label, initial, children, className = "", mobileInitial, movable = true, onEdit, onDelete }: { onEdit?:()=>void; onDelete?:()=>void; mobileInitial?: [number,number]; movable?: boolean; id: string; label: string; initial: [number,number]; children: ReactNode; className?: string }) {
  const {positions,place,active} = useContext(CanvasContext)
  const [menuOpen,setMenuOpen]=useState(false)
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null)
  const suppressed=useRef(false)
  const start=useRef({x:0,y:0})
  function cancelHold(){if(hold.current)clearTimeout(hold.current);hold.current=null}
  useEffect(()=>()=>cancelHold(),[])
  useEffect(()=>{if(!menuOpen)return;function dismiss(){setMenuOpen(false)};window.addEventListener("pointerdown",dismiss);window.addEventListener("scroll",dismiss,true);return()=>{window.removeEventListener("pointerdown",dismiss);window.removeEventListener("scroll",dismiss,true)}},[menuOpen])
  const node = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; x: number; y: number; startX: number; startY: number; scrollTop: number; pointerX: number; pointerY: number; point: Point; base?: Point; moved: boolean } | null>(null)
  const [size, setSize] = useState({w:0,h:0,mobile:false})
  const [moving, setMoving] = useState<Point | null>(null)
  const systemMobile: Record<string,[number,number]> = {clock:[.98,.02],projects:[0,.42],instructions:[.5,.42],profile:[1,.42]}
  const origin = size.mobile ? mobileInitial || systemMobile[id] || initial : initial
  const p: Point = movable ? moving || positions[id] || {x:origin[0],y:origin[1],z:1} : {x:origin[0],y:origin[1],z:1}
  useEffect(() => {
    const element=node.current, parent=element?.parentElement
    if (!element || !parent) return
    const measure=()=>setSize({w:Math.max(0,parent.clientWidth-element.offsetWidth),h:Math.max(0,parent.clientHeight-element.offsetHeight),mobile:parent.clientWidth<=600})
    const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(parent);measure()
    return ()=>observer.disconnect()
  }, [])
  const clamp=(x:number,y:number):Point=>({...p,x:Math.min(1,Math.max(0,x)),y:Math.min(1,Math.max(0,y)),z:Math.min(999,Math.max(1,...Object.values(positions).map(v=>v.z))+1)})
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  function followDrag() {
    const d = drag.current
    const canvas = node.current?.parentElement
    if (!canvas || !d?.moved) return
    const bounds = canvas.getBoundingClientRect()
    d.point = clamp((d.startX + d.pointerX - d.x) / (size.w || 1),
      (d.startY + d.pointerY - d.y + canvas.scrollTop - d.scrollTop) / (size.h || 1))
    setMoving(d.point)
    frame.current = requestAnimationFrame(followDrag)
  }
  return <div ref={node} tabIndex={movable?0:undefined} aria-label={label} data-desktop-id={id} data-desktop-label={label} className={`desktop-item ${className}${moving ? " is-moving" : ""}`} style={{left:p.x*size.w,top:p.y*size.h,zIndex:menuOpen?1000:p.z}}
    onDragStart={e=>e.preventDefault()}
    onContextMenu={e=>{if(!movable)return;e.preventDefault();e.stopPropagation();cancelHold();setMenuOpen(true)}}
    onPointerDown={e=>{
      cancelHold();suppressed.current=false
      if(!movable||e.button!==0||(e.target as Element).closest("textarea,input,button:not(.desktop-launch)"))return
      start.current={x:e.clientX,y:e.clientY}
      if(!window.matchMedia("(max-width:600px)").matches&&active&&!p.locked&&(e.target as Element).closest(".desktop-app-icon,.lab-pin-head,.tic-handle"))drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:p.x*size.w,startY:p.y*size.h,scrollTop:node.current?.parentElement?.scrollTop ?? 0,pointerX:e.clientX,pointerY:e.clientY,point:p,base:positions[id],moved:false}
      hold.current=setTimeout(()=>{drag.current=null;suppressed.current=true;setMenuOpen(true)},600)
    }}
    onPointerMove={e=>{
      const distance=Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)
      if(distance>8)cancelHold()
      const d=drag.current;if(!d||d.pointer!==e.pointerId||distance<=8)return
      d.pointerX=e.clientX; d.pointerY=e.clientY
      if(!d.moved){d.moved=true;suppressed.current=true;e.currentTarget.setPointerCapture(e.pointerId);followDrag()}
    }}
    onPointerUp={e=>{cancelHold();const d=drag.current;if(d?.pointer===e.pointerId){cancelAnimationFrame(frame.current);if(d.moved)place(id,d.point,{point:d.base});drag.current=null;setMoving(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}}
    onPointerCancel={()=>{cancelAnimationFrame(frame.current);cancelHold();drag.current=null;setMoving(null)}}
    onClickCapture={e=>{if(suppressed.current){e.preventDefault();e.stopPropagation();suppressed.current=false}}}
    onKeyDown={e=>{
      if(e.target!==e.currentTarget||!movable)return
      if(e.key==="ContextMenu"||(e.shiftKey&&e.key==="F10")){e.preventDefault();setMenuOpen(true);return}
      const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}
      const direction=directions[e.key];if(!direction||p.locked||!active)return
      e.preventDefault();const step=e.shiftKey?40:10;place(id,clamp(p.x+direction[0]*step/(size.w||1),p.y+direction[1]*step/(size.h||1)))
    }}>
    {p.title ? Children.map(children, child=>{
      if(!isValidElement<{className?:string;children?:ReactNode}>(child)||!child.props.className?.includes("desktop-launch"))return child
      return cloneElement(child,{},Children.map(child.props.children,c=>isValidElement(c)&&c.type==="strong"?cloneElement(c as ReactElement<{children?:ReactNode}>,{},p.title):c))
    }):children}
    {menuOpen&&createPortal(<div style={{position:"fixed",left:Math.max(8,Math.min(window.innerWidth-208,node.current?.getBoundingClientRect().left||8)),top:Math.max(8,Math.min(window.innerHeight-350,node.current?.getBoundingClientRect().top||8)),zIndex:11950}} className="shortcut-actions" role="group" aria-label={`Действия: ${label}`} onPointerDown={e=>{e.stopPropagation();suppressed.current=false}} onKeyDown={e=>{if(e.key==="Escape")setMenuOpen(false)}}>
      <button onClick={()=>{setMenuOpen(false);if(onEdit){onEdit();return}const title=window.prompt("Название ярлыка",p.title||label);if(title?.trim())place(id,{...p,title:title.trim().slice(0,64)})}}>Редактировать</button>
      <button onClick={()=>{place(id,{...p,locked:!p.locked});setMenuOpen(false)}}>{p.locked?"Открепить":"Закрепить"}</button>
      {onDelete&&<button onClick={()=>{setMenuOpen(false);onDelete()}}>Удалить</button>}
      <button onClick={()=>setMenuOpen(false)}>Закрыть меню</button>
    </div>,document.body)}
  </div>
}
