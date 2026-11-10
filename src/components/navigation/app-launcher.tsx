"use client"
import { useRef, useState } from "react"
import Link from "next/link"
import { useDockShortcuts } from "@/components/lab/dock-shortcuts"
import { X, Pin, Search, type LucideIcon } from "lucide-react"
type App = {path:string;label:string;icon:LucideIcon;color:string}
export function AppLauncher({apps,fixedPaths=[]}:{apps:App[];fixedPaths?:string[]}) {
 const dock=useDockShortcuts(),[notice,setNotice]=useState('')
 const dialog=useRef<HTMLDialogElement>(null), [query,setQuery]=useState("")
 const close=()=>dialog.current?.close()
 return <><button type="button" className="os-dock-item dock-launcher" aria-label="Все приложения" aria-haspopup="dialog" onClick={()=>{setQuery("");dialog.current?.showModal()}}><i className="launcher-dot-icon" aria-hidden="true">{Array.from({length:9},(_,i)=><b key={i}/>)}</i><span>Все приложения</span></button>
 <dialog ref={dialog} className="app-launcher" aria-labelledby="launcher-title" onClick={e=>{if(e.target===e.currentTarget)close()}}>
 <header><h2 id="launcher-title">Все приложения</h2><button type="button" autoFocus aria-label="Закрыть каталог" onClick={close}><X/></button></header>
 <label className="launcher-search"><Search size={20}/><input type="search" placeholder="Найти приложение" aria-label="Найти приложение" value={query} onChange={e=>setQuery(e.target.value)}/></label>
 <div className="launcher-grid">{apps.filter(app=>app.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())).map(app=><div className="launcher-app" key={app.path}><Link href={app.path} key={app.path} onClick={close}><div className={`os-dock-item dock-${app.color}`}><app.icon size={30}/></div><strong>{app.label}</strong></Link><button className="launcher-pin" disabled={!dock.ready||fixedPaths.includes(app.path)} onClick={()=>{const pinned=dock.pins.some(p=>p.href===app.path);if(pinned)dock.unpin(app.path);else setNotice(dock.pin({href:app.path,label:app.label})?"Добавлено в панель":"В панели до 10 дополнительных ярлыков")}} aria-label={`Закрепить в панели: ${app.label}`}><Pin size={14}/>{fixedPaths.includes(app.path)?"Уже в bar":dock.pins.some(p=>p.href===app.path)?"Убрать из bar":"В bar"}</button></div>)}</div>
 {!apps.some(app=>app.label.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))&&<p className="launcher-empty">Ничего не найдено. Попробуйте другое название.</p>}
 {notice&&<p role="status" className="launcher-empty">{notice}</p>}
 <footer><button type="button" onClick={close}>Вернуться в мастерскую</button></footer></dialog></>
}
