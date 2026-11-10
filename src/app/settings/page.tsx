"use client"
import Link from "next/link"
import { useState } from "react"
import { ArrowLeft, Palette, PanelBottom, Clock, UserRound } from "lucide-react"
import { useRouter } from "next/navigation"
import { useAccess } from "@/components/auth/access-provider"
import { signOutFromSupabase } from "@/lib/auth"
import { defaults, useWorkspaceSettings } from "@/components/lab/workspace-settings"
export default function SettingsPage(){
 const {settings,update,error,ready}=useWorkspaceSettings(),access=useAccess(),router=useRouter()
 const [tab,setTab]=useState("appearance")
 const categories=[{id:"appearance",label:"Оформление",icon:Palette},{id:"panel",label:"Панель разделов",icon:PanelBottom},{id:"clock",label:"Часы",icon:Clock},{id:"account",label:"Аккаунт",icon:UserRound}]
 return <main className="workspace-settings"><aside className="settings-sidebar"><Link href="/dashboard" className="settings-home"><ArrowLeft size={18}/> Мастерская</Link><h1>Настройки</h1><nav aria-label="Категории настроек">{categories.map(category=><button type="button" key={category.id} aria-current={tab===category.id?"page":undefined} onClick={()=>setTab(category.id)}><category.icon size={20}/>{category.label}</button>)}</nav></aside><div className="settings-detail"><h2 className="settings-title">{categories.find(category=>category.id===tab)?.label}</h2><p>Настройки сохраняются в аккаунте и доступны на других устройствах.</p>
 <section hidden={tab!=="appearance"}><label>Тема<select disabled={!ready} value={settings.theme} onChange={e=>update({theme:e.target.value as typeof settings.theme})}><option value="light">Светлая</option><option value="dark">Тёмная</option></select></label><label>Фон<select disabled={!ready} value={settings.background} onChange={e=>update({background:e.target.value as typeof settings.background})}><option value="grid">Чертёжная сетка</option><option value="plain">Однотонный</option><option value="dots">Точки</option></select></label><label>Цвет фона<input disabled={!ready} type="color" value={settings.color} onChange={e=>update({color:e.target.value})}/></label></section>
 <section hidden={tab!=="panel"}><p className="panel-mobile-note">На телефоне панель всегда снизу. Выбранное положение используется на планшете и компьютере.</p><label>Положение<select disabled={!ready} value={settings.bar} onChange={e=>update({bar:e.target.value as typeof settings.bar})}><option value="bottom">Снизу</option><option value="top">Сверху</option><option value="left">Слева</option><option value="right">Справа</option></select></label></section>
 <section hidden={tab!=="clock"}><label>Вид часов<select disabled={!ready} value={settings.clock} onChange={e=>update({clock:e.target.value as typeof settings.clock})}><option value="digital">Крупные цифровые</option><option value="minimal">Минималистичные</option><option value="hidden">Убрать часы</option></select></label></section>
 <section hidden={tab!=="account"}><p>{access.profile?.nickname||"Вход в TLC"}</p><div className="settings-links"><Link href="/profile">Профиль</Link><Link href="/avatar">Аватар</Link>{access.role==="teacher"&&<Link href="/teacher/achievements">Достижения учеников</Link>}{access.userId?<button onClick={async()=>{await signOutFromSupabase(localStorage);router.replace("/login");router.refresh()}}>Выйти из аккаунта</button>:<Link href="/login">Войти</Link>}</div></section>
 <button disabled={!ready} hidden={tab==="account"} className="settings-reset" onClick={()=>update(defaults)}>Восстановить оформление</button>{error&&<p role="alert">{error}</p>}</div></main>
}
