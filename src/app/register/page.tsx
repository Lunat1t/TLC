"use client"
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { registerStudentWithSupabase, pinPassword } from "@/lib/auth"
import { createClient } from "@/utils/supabase/client"
import { GoogleSignIn } from "@/components/google-signin"
const roles = [{id:"teacher",name:"Учитель",icon:"📚"},{id:"student",name:"Ученик",icon:"🤖"},{id:"parent",name:"Родитель",icon:"🏡"}] as const
const options=["LEGO WeDo","LEGO SPIKE","LEGO EV3","VEX"]
type Role=typeof roles[number]["id"]
export default function RegisterPage(){
 const router=useRouter(); const [role,setRole]=React.useState<Role|null>(null); const [step,setStep]=React.useState(0)
 const [disciplines,setDisciplines]=React.useState<string[]>([]); const [name,setName]=React.useState("");const [age,setAge]=React.useState("");const [pin,setPin]=React.useState("")
 const [googleUser,setGoogleUser]=React.useState(false);const [busy,setBusy]=React.useState(false);const [error,setError]=React.useState("")
 React.useEffect(()=>{const token=new URLSearchParams(window.location.search).get("student");if(token&&/^[0-9a-f-]{36}$/i.test(token))sessionStorage.setItem("tlc.pending-student",token);void createClient().auth.getUser().then(({data})=>setGoogleUser(!!data.user))},[])
 const steps=role==="teacher"?["role","disciplines","name","age","pin"]:["role","name","age","pin"]
 const current=steps[step];const title=current==="role"?"Давайте познакомимся":current==="disciplines"?"Что вы преподаёте?":current==="name"?"Как вас зовут?":current==="age"?"Сколько вам лет?":"Придумайте код из 4 цифр"
 async function next(event:React.FormEvent){event.preventDefault();setError("");
 if(current==="role"&&!role){setError("Выберите роль.");return}
 if(current==="disciplines"&&!disciplines.length){setError("Выберите хотя бы одну дисциплину.");return}
 if(current==="name"&&!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name)){setError("Напишите имя латиницей, без пробелов. До 32 символов.");return}
 if(current==="age"&&(!/^\d{1,3}$/.test(age)||Number(age)<1||Number(age)>120)){setError("Укажите возраст от 1 до 120 лет.");return}
 if(current!=="pin"){setStep(step+1);return}
 if(!/^\d{4}$/.test(pin)){setError("Нужно ровно 4 цифры.");return}
 setBusy(true);try{
  if(googleUser){const client=createClient();const {error:passwordError}=await client.auth.updateUser({password:pinPassword(pin),data:{login:name,nickname:name}});if(passwordError)throw passwordError;const {error}=await client.rpc("complete_tlc_onboarding",{p_login:name,p_age:Number(age),p_role:role,p_disciplines:role==="teacher"?disciplines:[]});if(error)throw error}
  else await registerStudentWithSupabase(localStorage,{login:name,password:pin,age:Number(age),role:role!,disciplines:role==="teacher"?disciplines:[]})
  router.replace(role==="parent"?"/profile":"/dashboard");router.refresh()
 }catch(e){setError(e instanceof Error?e.message:"Не удалось создать аккаунт.")}finally{setBusy(false)}}
 return <main className="min-h-dvh grid place-items-center p-5 bg-[#f4f9fb]"><Card className="w-full max-w-xl"><CardHeader><span className="text-sm font-bold text-cyan-700">TLC · Знакомство · {step+1}/{steps.length}</span><h1 className="text-3xl font-black text-[#102c35]">{title}</h1></CardHeader><CardContent><form onSubmit={next} className="grid gap-5">
 {current==="role"&&<div className="grid gap-3">{roles.map(item=><button key={item.id} type="button" aria-pressed={role===item.id} onClick={()=>setRole(item.id)} className={`rounded-2xl border-2 p-5 text-left text-lg font-bold ${role===item.id?"border-cyan-500 bg-cyan-50":"border-slate-200"}`}>{item.icon} {item.name}</button>)}</div>}
 {current==="disciplines"&&<div className="grid gap-3"><p>Можно выбрать несколько.</p>{options.map(item=><label key={item} className="flex gap-3 items-center rounded-xl border p-4 font-bold"><input type="checkbox" checked={disciplines.includes(item)} onChange={()=>setDisciplines(old=>old.includes(item)?old.filter(v=>v!==item):[...old,item])}/>{item}</label>)}</div>}
 {current==="name"&&<div className="grid gap-2"><Input key="name" aria-label="Имя латиницей" autoFocus maxLength={32} autoComplete="username" placeholder="Например, Alua" value={name} onChange={e=>setName(e.target.value)}/><p className="text-sm text-slate-600">Напишите имя английскими буквами — это будет ваш логин.</p></div>}
 {current==="age"&&<Input key="age" aria-label="Возраст в годах" autoFocus inputMode="numeric" maxLength={3} placeholder="Например, 10" value={age} onChange={e=>setAge(e.target.value.replace(/\D/g,""))}/>}
 {current==="pin"&&<div className="grid gap-2"><Input key="pin" aria-label="Код из четырёх цифр" autoFocus type="password" inputMode="numeric" autoComplete="new-password" maxLength={4} placeholder="0000" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))}/><p className="text-sm text-slate-600">Этот код будет вашим паролем. Запомните его.</p></div>}
 {error&&<p role="alert" className="text-red-700">{error}</p>}
 <div className="flex gap-3">{step>0&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{setStep(step-1);setError("")}}>Назад</Button>}<Button type="submit" className="flex-1" disabled={busy}>{busy?"Сохраняем…":current==="pin"?"Готово":"Дальше →"}</Button></div>
 </form>{current==="role"&&!googleUser&&<div className="grid gap-4 mt-5"><GoogleSignIn/><Link href="/login" className="text-center font-bold text-cyan-800">Уже есть аккаунт? Войти</Link></div>}</CardContent></Card></main>
}
