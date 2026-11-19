"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Map, Home, BookOpen, UserRound, Settings, FilePlus2, FolderOpen, Trophy } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import { useRouteWarmup } from "@/components/auth/app-startup"
import { AppLauncher } from "./app-launcher"
import "./studio-bar.css"
import "./student-navigation.css"
import "./desktop-shell.css"
import "./viewport-layout.css"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"

export function StudentNavigation({children}: {children: ReactNode}) {
  const path=usePathname(), access=useAccess(), warm=useRouteWarmup()
  const {settings}=useWorkspaceSettings()
  const home=path==="/dashboard", preferences=path==="/settings"
  const appPage=path==="/map" || path==="/files" || path==="/settings" || home || path.startsWith("/instructions") || path==="/avatar" || path==="/profile" || path.startsWith("/teacher/") || path.startsWith("/admin/") || path==="/link-student"
  const pages = [
    { path: "/files", label: "Файлы", icon: FolderOpen, color: "yellow" },
    { path: "/dashboard", label: "Рабочий стол", icon: Home, color: "blue" },
    ...(access.role === "student" || access.role === "teacher" ? [
      { path: "/map", label: "Карта", icon: Map, color: "blue" },
      { path: "/instructions", label: "Инструкции", icon: BookOpen, color: "yellow" },
      { path: "/avatar", label: "Персонажи", icon: UserRound, color: "red" },
    ] : []),
    ...(access.canPublish ? [{ path: "/admin/instructions/drive", label: "Добавить инструкцию", icon: FilePlus2, color: "purple" }] : []),
  ]
  const teacherPages = access.role === "teacher" || access.isAdmin
    ? [{ path: "/teacher/achievements", label: access.isAdmin ? "Прогресс учеников" : "Достижения учеников", icon: Trophy, color: "purple" }]
    : []
  return <div data-wallpaper={settings.background==="wallpaper"&&!!settings.wallpaper?"true":undefined} data-theme={settings.theme} data-background={settings.background} data-bar={settings.bar} style={{"--workspace-background":settings.color,...(settings.background==="wallpaper"&&settings.wallpaper?{backgroundImage:`url("${settings.wallpaper}")`,backgroundSize:settings.wallpaperFit||"cover",backgroundPosition:"center top",backgroundRepeat:"no-repeat",backgroundAttachment:"fixed"}:{})} as React.CSSProperties} className={`tlc-os${home?" is-desktop":""}${preferences?" is-preferences":""}${appPage?" is-app":" is-public"}`}>
    <div className="os-content">{appPage&&!home&&!preferences?<div className={`workshop-section${path==="/avatar"?" workshop-avatar":""}`}><div className="workshop-section-body">{children}</div></div>:children}</div>
    <nav className="studio-bar" aria-label="Разделы Brick Studio">
      <div className="studio-tabs">
        {[{ path: "/dashboard", label: "Рабочий стол", icon: Home }, ...pages.filter(page => ["/files", "/map"].includes(page.path)), { path: "/profile", label: "Профиль", icon: UserRound }].map(page =>
          <Link key={page.path} href={page.path} aria-label={page.label} title={page.label}
            aria-current={path === page.path ? "page" : undefined} onPointerEnter={() => warm(page.path)} onFocus={() => warm(page.path)}>
            <page.icon size={21} aria-hidden="true" />
          </Link>
        )}
      </div>
      <AppLauncher apps={[...pages, { path: "/profile", label: "Профиль", icon: UserRound, color: "red" }, ...teacherPages, { path: "/settings", label: "Настройки", icon: Settings, color: "account" }]} />
    </nav>

  </div>
}
