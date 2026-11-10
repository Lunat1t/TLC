"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, BookOpen, UserRound, Settings, FilePlus2, ArrowLeft, Wrench } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useRouteWarmup } from "@/components/auth/app-startup"
import { signOutFromSupabase } from "@/lib/auth"
import "./student-navigation.css"
import "./desktop-shell.css"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"

export function StudentNavigation({children}: {children: ReactNode}) {
  const path=usePathname(), router=useRouter(), access=useAccess(), warm=useRouteWarmup()
  const {settings}=useWorkspaceSettings()
  const editor=path==="/editor", home=path==="/dashboard"
  const appPage=path==="/settings" || home || path.startsWith("/instructions") || path==="/avatar" || path==="/profile" || path.startsWith("/teacher/") || path.startsWith("/admin/") || path==="/link-student"
  const title=path==="/settings"?"Настройки":home?"Моя лаборатория":path==="/avatar"?"Мой аватар":path==="/profile"?"Профиль":path.startsWith("/teacher")?"Достижения":path.startsWith("/admin")?"Мастерская инструкций":path.startsWith("/instructions")?"Инструкции":path==="/link-student"?"Подключить ученика":"TLC"
  const pages=[{path:"/dashboard",label:"Рабочий стол",icon:LayoutDashboard,color:"blue"},...(access.role==="student"||access.role==="teacher"?[{path:"/instructions",label:"Инструкции",icon:BookOpen,color:"yellow"},{path:"/avatar",label:"Аватар",icon:UserRound,color:"red"}]:[]),...(access.canPublish?[{path:"/admin/instructions/drive",label:"Добавить инструкцию",icon:FilePlus2,color:"purple"}]:[])]
  if(editor)return <>{children}</>
  return <div data-theme={settings.theme} data-background={settings.background} data-bar={settings.bar} style={{"--workspace-background":settings.color} as React.CSSProperties} className={`tlc-os${home?" is-desktop":""}${appPage?" is-app":" is-public"}`}>
    {appPage&&!home&&<header className="os-menubar"><Link href="/dashboard" className="os-brand">TLC<span>Мастерская робототехники</span></Link><span className="os-page-title">{title}</span><span className="os-owner">{access.profile?.nickname||"Инженерная лаборатория"}</span></header>}
    <div className="os-content">{appPage&&!home?<div className={`workshop-section${path==="/avatar"?" workshop-avatar":""}`}><header className="workshop-section-header"><Link href="/dashboard" className="workshop-back"><ArrowLeft size={16}/> Моя лаборатория</Link><span aria-hidden="true">/</span><strong>{title}</strong><Wrench className="workshop-section-icon" size={20} aria-hidden="true"/></header><div className="workshop-section-body">{children}</div></div>:children}</div>
    {appPage&&<nav className="os-dock" aria-label="Разделы лаборатории TLC">{pages.map(page=><Link key={page.path} href={page.path} className={`os-dock-item dock-${page.color}`} aria-label={page.label} aria-current={(path===page.path||(page.path==="/instructions"&&path.startsWith("/instructions/")))?"page":undefined} onPointerEnter={()=>warm(page.path)} onFocus={()=>warm(page.path)}><page.icon size={26}/><span>{page.label}</span></Link>)}<div className="os-dock-separator"/><Link href="/settings" className="os-dock-item dock-account" aria-label="Настройки" aria-current={path==="/settings"?"page":undefined}><Settings size={26}/><span>Настройки</span></Link></nav>}
  </div>
}
