"use client"
import { useEffect,useState } from "react"
import { createClient } from "@/utils/supabase/client"
import { getSupabaseConfig } from "@/utils/supabase/config"
import { Button } from "@/components/ui/button"
export function GoogleSignIn() {
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [enabled,setEnabled]=useState(false)
 useEffect(()=>{let active=true;try{const {url,publishableKey}=getSupabaseConfig();void fetch(`${url}/auth/v1/settings`,{headers:{apikey:publishableKey}}).then(r=>r.json()).then(data=>{if(active)setEnabled(data.external?.google===true)}).catch(()=>{})}catch{}return()=>{active=false}},[])
 return <div><Button type="button" variant="outline" className="w-full" disabled={busy||!enabled} onClick={async()=>{setBusy(true);setError("");try{const {error}=await createClient().auth.signInWithOAuth({provider:"google",options:{redirectTo:`${window.location.origin}/auth/callback`}});if(error)throw error}catch{setError("Сейчас не удалось войти через Google. Попробуйте снова.");setBusy(false)}}}>Войти через Google</Button>{!enabled&&<p className="text-sm text-slate-600 mt-2">Вход через Google скоро появится.</p>}{error&&<p role="alert" className="text-sm text-red-700 mt-2">{error}</p>}</div>
}
