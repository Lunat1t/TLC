"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAccess } from "@/components/auth/access-provider"
import { signOutFromSupabase } from "@/lib/auth"
import { defaults, useWorkspaceSettings } from "@/components/lab/workspace-settings"
export default function SettingsPage(){
 const {settings,update,error}=useWorkspaceSettings(),access=useAccess(),router=useRouter()
 return <main className="workspace-settings"><h1>Настройки лаборатории</h1><p>Настрой рабочее место под себя. Изменения применяются сразу.</p>
 <section><h2>Оформление</h2><label>Тема<select value={settings.theme} onChange={e=>update({theme:e.target.value as typeof settings.theme})}><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label>Фон<select value={settings.background} onChange={e=>update({background:e.target.value as typeof settings.background})}><option value="grid">Чертёжная сетка</option><option value="plain">Однотонный</option><option value="dots">Точки</option></select></label><label>Цвет фона<input type="color" value={settings.color} onChange={e=>update({color:e.target.value})}/></label></section>
 <section><h2>Панель разделов</h2><label>Положение<select value={settings.bar} onChange={e=>update({bar:e.target.value as typeof settings.bar})}><option value="bottom">Снизу</option><option value="top">Сверху</option><option value="left">Слева</option><option value="right">Справа</option></select></label></section>
 <section><h2>Часы</h2><label>Вид часов<select value={settings.clock} onChange={e=>update({clock:e.target.value as typeof settings.clock})}><option value="digital">Крупные цифровые</option><option value="minimal">Минималистичные</option><option value="hidden">Убрать часы</option></select></label></section>
 <section><h2>Аккаунт</h2><p>{access.profile?.nickname||"Вход в TLC"}</p><div className="settings-links"><Link href="/profile">Профиль</Link><Link href="/avatar">Аватар</Link>{access.role==="teacher"&&<Link href="/teacher/achievements">Достижения учеников</Link>}{access.userId?<button onClick={async()=>{await signOutFromSupabase(localStorage);router.replace("/login");router.refresh()}}>Выйти из аккаунта</button>:<Link href="/login">Войти</Link>}</div></section>
 <button className="settings-reset" onClick={()=>update(defaults)}>Восстановить оформление</button>{error&&<p role="alert">{error}</p>}</main>
}
