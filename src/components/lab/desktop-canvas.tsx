"use client"

import { Children, cloneElement, isValidElement, createContext, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useAccountWorkspace } from "./account-workspace"
import { useDockShortcuts, DOCK_DRAG_TYPE } from "./dock-shortcuts"
import { GripHorizontal } from "lucide-react"

type Point = { x: number; y: number; z: number; locked?: boolean; title?: string }
type Positions = Record<string, Point>
const CanvasContext = createContext<{ positions: Positions; place: (id: string, point: Point) => void; active: boolean }>({ positions: {}, place: () => {}, active: false })
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
        if(p&&typeof p==='object'&&[p.x,p.y,p.z].every(Number.isFinite))clean[id]={x:Math.min(1,Math.max(0,p.x)),y:Math.min(1,Math.max(0,p.y)),z:Math.min(999,Math.max(1,p.z)),locked:p.locked===true,title:typeof p.title==='string'?p.title.slice(0,64):undefined}
      }
      setPositions(clean);setActive(true);setError('')
    }catch{setError('Не удалось загрузить расстановку аккаунта.')}
  },[store.ready,store.values.layout])
  function place(id:string,point:Point){if(!active)return;const next={...positions,[id]:point};if(store.update('layout',next)){setPositions(next);setError('')}}
  return <CanvasContext.Provider value={{positions,place,active}}><div className="desktop-canvas" data-swipe-ignore>{children}</div>{error && <p className="desktop-save-error" role="alert">{error}</p>}</CanvasContext.Provider>
}
export function DesktopItem({ id, label, initial, children, className = "", mobileInitial, movable = true, onEdit, onDelete }: { onEdit?:()=>void; onDelete?:()=>void; mobileInitial?: [number,number]; movable?: boolean; id: string; label: string; initial: [number,number]; children: ReactNode; className?: string }) {
  const dock=useDockShortcuts()
  const linkChild=Children.toArray(children).find(child=>isValidElement<{href?:string}>(child)&&typeof child.props.href==='string') as ReactElement<{href:string}>|undefined
  const shortcut=linkChild?{href:linkChild.props.href,label}:id==='projects'?{href:'/dashboard',label}:null
  const {positions,place,active} = useContext(CanvasContext)
  const [menuOpen,setMenuOpen]=useState(false)
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null)
  const suppressed=useRef(false)
  const start=useRef({x:0,y:0})
  function cancelHold(){if(hold.current)clearTimeout(hold.current);hold.current=null}
  useEffect(()=>()=>cancelHold(),[])
  useEffect(()=>{if(!menuOpen)return;function dismiss(){setMenuOpen(false)};window.addEventListener("pointerdown",dismiss);window.addEventListener("scroll",dismiss,true);return()=>{window.removeEventListener("pointerdown",dismiss);window.removeEventListener("scroll",dismiss,true)}},[menuOpen])
  const node = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pointer: number; x: number; y: number; startX: number; startY: number; point: Point } | null>(null)
  const [size, setSize] = useState({w:0,h:0,mobile:false})
  const [moving, setMoving] = useState<Point | null>(null)
  const systemMobile: Record<string,[number,number]> = {avatar:[.02,.02],clock:[.98,.02],projects:[0,.42],instructions:[.5,.42],profile:[1,.42]}
  const origin = size.mobile ? mobileInitial || systemMobile[id] || initial : initial
  const p: Point = movable ? moving || positions[id] || {x:origin[0],y:origin[1],z:1} : {x:origin[0],y:origin[1],z:1}
  useEffect(() => {
    const element=node.current, parent=element?.parentElement
    if (!element || !parent) return
    const measure=()=>setSize({w:Math.max(0,parent.clientWidth-element.offsetWidth),h:Math.max(0,parent.clientHeight-element.offsetHeight),mobile:parent.clientWidth<700})
    const observer=new ResizeObserver(measure);observer.observe(element);observer.observe(parent);measure()
    return ()=>observer.disconnect()
  }, [])
  const clamp=(x:number,y:number):Point=>({x:Math.min(1,Math.max(0,x)),y:Math.min(1,Math.max(0,y)),z:Math.min(999,Math.max(1,...Object.values(positions).map(v=>v.z))+1)})
  return <div draggable={!!shortcut} onDragStart={e=>{if(!shortcut||(e.target as Element).closest('.desktop-drag-handle')){e.preventDefault();return}e.dataTransfer.setData(DOCK_DRAG_TYPE,JSON.stringify({...shortcut,label:p.title||label}));e.dataTransfer.effectAllowed='copy';cancelHold()}} onContextMenu={e=>{if(!movable)return;e.preventDefault();e.stopPropagation();setMenuOpen(true)}} onPointerDown={e=>{cancelHold();suppressed.current=false;if(!movable||e.button!==0||(e.target as Element).closest(".desktop-drag-handle,.shortcut-actions,textarea,input"))return;start.current={x:e.clientX,y:e.clientY};hold.current=setTimeout(()=>{suppressed.current=true;setMenuOpen(true)},600)}} onPointerMove={e=>{if(Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>10)cancelHold()}} onPointerLeave={cancelHold} onPointerUp={cancelHold} onPointerCancel={cancelHold} onClickCapture={e=>{if(suppressed.current){e.preventDefault();e.stopPropagation()}}} ref={node} data-desktop-id={id} data-desktop-label={label} className={`desktop-item ${className}${moving ? " is-moving" : ""}`} style={{left:p.x*size.w,top:p.y*size.h,zIndex:menuOpen?1000:p.z}}>
    {movable && !p.locked && <button className="desktop-drag-handle" disabled={!active} aria-label={`Переместить: ${label}`} title="Перетащите или используйте стрелки клавиатуры" onPointerDown={e=>{
      if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId)
      const point=clamp(p.x,p.y);drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,startX:p.x*size.w,startY:p.y*size.h,point};setMoving(point)
    }} onPointerMove={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;const point=clamp(size.w?(d.startX+e.clientX-d.x)/size.w:0,size.h?(d.startY+e.clientY-d.y)/size.h:0);d.point=point;setMoving(point)}} onPointerUp={e=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;place(id,d.point);drag.current=null;setMoving(null);e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{drag.current=null;setMoving(null)}} onKeyDown={e=>{
      const d:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};if(!d[e.key])return;e.preventDefault();const step=e.shiftKey?40:10;place(id,clamp(p.x+d[e.key][0]*step/(size.w||1),p.y+d[e.key][1]*step/(size.h||1)))
    }}><GripHorizontal size={18}/><span>{label}</span></button>}{p.title ? Children.map(children, child=>{
      if(!isValidElement<{className?:string;children?:ReactNode}>(child)||!child.props.className?.includes("desktop-launch"))return child
      return cloneElement(child,{},Children.map(child.props.children,c=>isValidElement(c)&&c.type==="strong"?cloneElement(c as ReactElement<{children?:ReactNode}>,{},p.title):c))
    }):children}
    {movable && <button className="shortcut-menu-trigger" aria-label={`Меню: ${label}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>setMenuOpen(!menuOpen)}>•••</button>}
    {menuOpen&&createPortal(<div style={{position:"fixed",left:Math.max(8,Math.min(window.innerWidth-208,node.current?.getBoundingClientRect().left||8)),top:Math.max(8,Math.min(window.innerHeight-240,node.current?.getBoundingClientRect().top||8)),zIndex:11950}} className="shortcut-actions" role="group" aria-label={`Действия: ${label}`} onPointerDown={e=>{e.stopPropagation();suppressed.current=false}} onKeyDown={e=>{if(e.key==="Escape")setMenuOpen(false)}}>
      <button onClick={()=>{setMenuOpen(false);if(onEdit){onEdit();return}const title=window.prompt("Название ярлыка",p.title||label);if(title?.trim())place(id,{...p,title:title.trim().slice(0,64)})}}>Редактировать</button>
      <button onClick={()=>{place(id,{...p,locked:!p.locked});setMenuOpen(false)}}>{p.locked?"Открепить":"Закрепить"}</button>
      {shortcut&&<button disabled={!dock.ready} onClick={()=>{if(!dock.pin({...shortcut,label:p.title||label}))window.alert("В панели до 10 дополнительных ярлыков.");setMenuOpen(false)}}>Добавить в bar</button>}
      {onDelete&&<button onClick={()=>{setMenuOpen(false);onDelete()}}>Удалить</button>}
      <button onClick={()=>setMenuOpen(false)}>Закрыть меню</button>
    </div>,document.body)}
  </div>
}
