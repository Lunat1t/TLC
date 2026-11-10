"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, BookOpen, UserRound, Settings, FilePlus2, ArrowLeft, Wrench, FolderOpen, Globe, X } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useRouteWarmup } from "@/components/auth/app-startup"
import { useDockShortcuts, DOCK_DRAG_TYPE } from "@/components/lab/dock-shortcuts"
import { cleanShortcut } from "@/components/lab/workspace-settings"
import { AppLauncher } from "./app-launcher"
import "./student-navigation.css"
import "./desktop-shell.css"
import "./viewport-layout.css"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"

export function StudentNavigation({children}: {children: ReactNode}) {
  const path=usePathname(), access=useAccess(), warm=useRouteWarmup()
  const dock=useDockShortcuts(),[dockOver,setDockOver]=useState(false),[dockNotice,setDockNotice]=useState('')
  const {settings}=useWorkspaceSettings()
  const editor=path==="/editor", home=path==="/dashboard", preferences=path==="/settings"
  const appPage=path==="/files" || path==="/settings" || home || path.startsWith("/instructions") || path==="/avatar" || path==="/profile" || path.startsWith("/teacher/") || path.startsWith("/admin/") || path==="/link-student"
  const title=path==="/files"?"Файлы":path==="/settings"?"Настройки":home?"Моя лаборатория":path==="/avatar"?"Мой аватар":path==="/profile"?"Профиль":path.startsWith("/teacher")?"Достижения":path.startsWith("/admin")?"Мастерская инструкций":path.startsWith("/instructions")?"Инструкции":path==="/link-student"?"Подключить ученика":"TLC"
  const pages=[{path:"/files",label:"Файлы",icon:FolderOpen,color:"yellow"},{path:"/dashboard",label:"Рабочий стол",icon:LayoutDashboard,color:"blue"},...(access.role==="student"||access.role==="teacher"?[{path:"/instructions",label:"Инструкции",icon:BookOpen,color:"yellow"},{path:"/avatar",label:"Аватар",icon:UserRound,color:"red"}]:[]),...(access.canPublish?[{path:"/admin/instructions/drive",label:"Добавить инструкцию",icon:FilePlus2,color:"purple"}]:[])]
  if(editor || /^\/instructions\/[^/]+\/read$/.test(path))return <>{children}</>
  return <div data-wallpaper={settings.background==="wallpaper"&&!!settings.wallpaper?"true":undefined} data-theme={settings.theme} data-background={settings.background} data-bar={settings.bar} style={{"--workspace-background":settings.color,...(settings.background==="wallpaper"&&settings.wallpaper?{backgroundImage:`url("${settings.wallpaper}")`,backgroundSize:settings.wallpaperFit||"cover",backgroundPosition:"center top",backgroundRepeat:"no-repeat",backgroundAttachment:"fixed"}:{})} as React.CSSProperties} className={`tlc-os${home?" is-desktop":""}${preferences?" is-preferences":""}${appPage?" is-app":" is-public"}`}>
    <div className="os-content">{appPage&&!home&&!preferences?<div className={`workshop-section${path==="/avatar"?" workshop-avatar":""}`}><div className="workshop-section-body">{children}</div></div>:children}</div>
    {appPage&&<nav onDragOver={e=>{if(e.dataTransfer.types.includes(DOCK_DRAG_TYPE)){e.preventDefault();e.dataTransfer.dropEffect="copy";setDockOver(true)}}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setDockOver(false)}} onDrop={e=>{e.preventDefault();setDockOver(false);try{const item=cleanShortcut(JSON.parse(e.dataTransfer.getData(DOCK_DRAG_TYPE)));if(item)setDockNotice(dock.pin(item)?"Ярлык добавлен в панель":"В панели до 10 дополнительных ярлыков. Уберите один, чтобы добавить новый.")}catch{setDockNotice("Не удалось добавить ярлык.")}}} className={`os-dock${dockOver?" is-drop-target":""}`} aria-label="Разделы лаборатории TLC"><AppLauncher fixedPaths={[...pages.map(p=>p.path),"/settings"]} apps={[...pages,{path:"/profile",label:"Профиль",icon:UserRound,color:"red"},...(access.role==="teacher"?[{path:"/teacher/achievements",label:"Достижения учеников",icon:BookOpen,color:"purple"}]:[]),{path:"/settings",label:"Настройки",icon:Settings,color:"account"}]}/>{pages.map(page=><Link key={page.path} href={page.path} className={`os-dock-item dock-${page.color}`} title={page.label} aria-label={page.label} aria-current={(path===page.path||(page.path==="/instructions"&&path.startsWith("/instructions/")))?"page":undefined} onPointerEnter={()=>warm(page.path)} onFocus={()=>warm(page.path)}><page.icon size={26}/><span>{page.label}</span></Link>)}{dock.pins.filter(pin=>!pages.some(p=>p.path===pin.href)&&pin.href!=="/settings").map(pin=><div key={pin.href} className="dock-pinned"><a href={pin.href} className="os-dock-item dock-purple" title={pin.label} aria-label={pin.label} target={pin.href.startsWith("/")?undefined:"_blank"} rel="noopener noreferrer"><Globe size={26}/><span>{pin.label}</span></a><button className="dock-unpin" aria-label={`Убрать из панели: ${pin.label}`} onClick={()=>dock.unpin(pin.href)}><X size={12}/></button></div>)}<div className="os-dock-separator"/><Link href="/settings" className="os-dock-item dock-account" aria-label="Настройки" aria-current={path==="/settings"?"page":undefined}><Settings size={26}/><span>Настройки</span></Link></nav>}
    {dockNotice&&<div className="dock-notice" role="status">{dockNotice}<button onClick={()=>setDockNotice('')} aria-label="Закрыть уведомление">×</button></div>}
  </div>
}
