"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, BookOpen, UserRound, Settings, FilePlus2, FolderOpen } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useRouteWarmup } from "@/components/auth/app-startup"
import { AppLauncher } from "./app-launcher"
import "./student-navigation.css"
import "./desktop-shell.css"
import "./viewport-layout.css"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"

export function StudentNavigation({children}: {children: ReactNode}) {
  const path=usePathname(), access=useAccess(), warm=useRouteWarmup()
  const {settings}=useWorkspaceSettings()
  const editor=path==="/editor", home=path==="/dashboard", preferences=path==="/settings"
  const appPage=path==="/files" || path==="/settings" || home || path.startsWith("/instructions") || path==="/avatar" || path==="/profile" || path.startsWith("/teacher/") || path.startsWith("/admin/") || path==="/link-student"
  const pages=[{path:"/files",label:"Файлы",icon:FolderOpen,color:"yellow"},{path:"/dashboard",label:"Рабочий стол",icon:Home,color:"blue"},...(access.role==="student"||access.role==="teacher"?[{path:"/instructions",label:"Инструкции",icon:BookOpen,color:"yellow"},{path:"/avatar",label:"Аватар",icon:UserRound,color:"red"}]:[]),...(access.canPublish?[{path:"/admin/instructions/drive",label:"Добавить инструкцию",icon:FilePlus2,color:"purple"}]:[])]
  if(editor || /^\/instructions\/[^/]+\/read$/.test(path))return <>{children}</>
  return <div data-wallpaper={settings.background==="wallpaper"&&!!settings.wallpaper?"true":undefined} data-theme={settings.theme} data-background={settings.background} data-bar={settings.bar} style={{"--workspace-background":settings.color,...(settings.background==="wallpaper"&&settings.wallpaper?{backgroundImage:`url("${settings.wallpaper}")`,backgroundSize:settings.wallpaperFit||"cover",backgroundPosition:"center top",backgroundRepeat:"no-repeat",backgroundAttachment:"fixed"}:{})} as React.CSSProperties} className={`tlc-os${home?" is-desktop":""}${preferences?" is-preferences":""}${appPage?" is-app":" is-public"}`}>
    <div className="os-content">{appPage&&!home&&!preferences?<div className={`workshop-section${path==="/avatar"?" workshop-avatar":""}`}><div className="workshop-section-body">{children}</div></div>:children}</div>
    {appPage&&<nav className="os-dock" aria-label="Разделы лаборатории TLC"><AppLauncher fixedPaths={[...pages.map(p=>p.path),"/settings"]} apps={[...pages,{path:"/profile",label:"Профиль",icon:UserRound,color:"red"},...(access.role==="teacher"?[{path:"/teacher/achievements",label:"Достижения учеников",icon:BookOpen,color:"purple"}]:[]),{path:"/settings",label:"Настройки",icon:Settings,color:"account"}]}/><Link href="/dashboard" className="os-dock-item dock-blue" aria-label="Главный экран" title="Главный экран" aria-current={home?"page":undefined} onPointerEnter={()=>warm("/dashboard")} onFocus={()=>warm("/dashboard")}><Home size={26}/><span>Главный экран</span></Link><Link href="/settings" className="os-dock-item dock-account" aria-label="Настройки" aria-current={path==="/settings"?"page":undefined}><Settings size={26}/><span>Настройки</span></Link></nav>}

  </div>
}
