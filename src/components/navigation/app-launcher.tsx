"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { createPortal } from "react-dom"
import { usePathname } from "next/navigation"
import { X, Search, type LucideIcon } from "lucide-react"
type App = {path:string;label:string;icon:LucideIcon;color:string}
export function AppLauncher({apps,fixedPaths=[]}:{apps:App[];fixedPaths?:string[]}) {
 const [open,setOpen]=useState(false), [query,setQuery]=useState("")
 const path=usePathname()
 const close=()=>setOpen(false)
 useEffect(()=>setOpen(false),[path])
 useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};document.addEventListener("keydown",escape);return()=>document.removeEventListener("keydown",escape)},[open])
 return <><button type="button" className="os-dock-item dock-launcher" aria-label="Все приложения" aria-haspopup="dialog" onClick={()=>{setQuery("");setOpen(value=>!value)}}><i className="launcher-dot-icon" aria-hidden="true">{Array.from({length:9},(_,i)=><b key={i}/>)}</i><span>Все приложения</span></button>
 {open&&createPortal(<div className="app-launcher is-open" role="dialog" aria-labelledby="launcher-title">
 <header><h2 id="launcher-title">Все приложения</h2><button type="button" autoFocus aria-label="Закрыть каталог" onClick={close}><X/></button></header>
 <label className="launcher-search"><Search size={20}/><input type="search" placeholder="Найти приложение" aria-label="Найти приложение" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <div className="launcher-grid">{apps.filter(app=>app.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).map(app=><div className="launcher-app" key={app.path}><Link href={app.path} key={app.path} onClick={close}><div className={`os-dock-item dock-${app.color}`}><app.icon size={30}/></div><strong>{app.label}</strong></Link></div>)}</div>
 {!apps.some(app=>app.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))&&<p className="launcher-empty">Ничего не найдено. Попробуйте другое название.</p>}
 <footer><button type="button" onClick={close}>Вернуться в мастерскую</button></footer></div>,document.body)}</>
}
