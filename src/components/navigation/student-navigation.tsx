"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, BookOpen, UserRound, CircleUserRound, FilePlus2, ArrowLeft, X } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useRouteWarmup } from "@/components/auth/app-startup"
import { signOutFromSupabase } from "@/lib/auth"
import "./student-navigation.css"
import "./desktop-shell.css"

export function StudentNavigation({children}: {children: ReactNode}) {
  const path=usePathname(), router=useRouter(), access=useAccess(), warm=useRouteWarmup()
  const [accountOpen,setAccountOpen]=useState(false)
  const account=useRef<HTMLDivElement>(null), toggle=useRef<HTMLButtonElement>(null)
  const editor=path==="/editor", home=path==="/dashboard"
  const appPage=home || path.startsWith("/instructions") || path==="/avatar" || path==="/profile" || path.startsWith("/teacher/") || path.startsWith("/admin/") || path==="/link-student"
  const title=home?"Рабочий стол":path==="/avatar"?"Мой аватар":path==="/profile"?"Профиль":path.startsWith("/teacher")?"Достижения":path.startsWith("/admin")?"Мастерская инструкций":path.startsWith("/instructions")?"Инструкции":"TLC"
  const pages=[{path:"/dashboard",label:"Рабочий стол",icon:LayoutDashboard,color:"blue"},...(access.role==="student"||access.role==="teacher"?[{path:"/instructions",label:"Инструкции",icon:BookOpen,color:"yellow"},{path:"/avatar",label:"Аватар",icon:UserRound,color:"red"}]:[]),...(access.canPublish?[{path:"/admin/instructions/drive",label:"Добавить инструкцию",icon:FilePlus2,color:"purple"}]:[])]
  useEffect(()=>{setAccountOpen(false)},[path])
  useEffect(()=>{
    if(!accountOpen)return
    function outside(e:PointerEvent){if(e.target instanceof Node&&!account.current?.contains(e.target))setAccountOpen(false)}
    function escape(e:KeyboardEvent){if(e.key==="Escape"){setAccountOpen(false);toggle.current?.focus()}}
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape)
    return ()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape)}
  },[accountOpen])
  if(editor)return <>{children}</>
  return <div className={`tlc-os${home?" is-desktop":""}${appPage?" is-app":" is-public"}`}>
    {appPage&&<header className="os-menubar"><Link href="/dashboard" className="os-brand">TLC<span>labOS</span></Link><span className="os-page-title">{title}</span><span className="os-owner">{access.profile?.nickname||"Инженерная лаборатория"}</span></header>}
    <div className="os-content">{appPage&&!home?<div className={`os-window${path==="/avatar"?" os-avatar-window":""}`}><header className="os-window-header"><Link href="/dashboard" aria-label="На рабочий стол" className="os-window-close"><X size={14}/></Link><span className="os-window-lights" aria-hidden="true"><i/><i/></span><strong>{title}</strong><Link href="/dashboard" className="os-window-back"><ArrowLeft size={14}/> На стол</Link></header><div className="os-window-body">{children}</div></div>:children}</div>
    {appPage&&<nav className="os-dock" aria-label="Панель задач TLC">{pages.map(page=><Link key={page.path} href={page.path} className={`os-dock-item dock-${page.color}`} aria-label={page.label} aria-current={(path===page.path||(page.path==="/instructions"&&path.startsWith("/instructions/")))?"page":undefined} onPointerEnter={()=>warm(page.path)} onFocus={()=>warm(page.path)}><page.icon size={26}/><span>{page.label}</span></Link>)}<div className="os-dock-separator"/><div className="os-account" ref={account}><button ref={toggle} className="os-dock-item dock-account" aria-label="Аккаунт" aria-expanded={accountOpen} aria-controls="os-account-menu" onClick={()=>setAccountOpen(!accountOpen)}><CircleUserRound size={26}/><span>Аккаунт</span></button>{accountOpen&&<div className="os-account-menu" id="os-account-menu"><strong>{access.profile?.nickname||"TLC"}</strong><Link href="/profile">Профиль</Link>{access.role==="teacher"&&<Link href="/teacher/achievements">Достижения учеников</Link>}{access.userId?<button onClick={async()=>{await signOutFromSupabase(window.localStorage);router.replace("/login");router.refresh()}}>Выйти</button>:<Link href="/login">Войти</Link>}</div>}</div></nav>}
  </div>
}
