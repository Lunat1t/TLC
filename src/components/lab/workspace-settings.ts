"use client"
import { useEffect, useState } from "react"
export type WorkspaceSettings = { theme: "light"|"dark"; background: "grid"|"plain"|"dots"; color: string; bar: "bottom"|"top"|"left"|"right"; clock: "digital"|"minimal"|"hidden" }
export const defaults: WorkspaceSettings = {theme:"light",background:"grid",color:"#e6f0fa",bar:"bottom",clock:"digital"}
const key="tlc-workspace-settings-v1"
function read(): WorkspaceSettings {
  try { const s=JSON.parse(localStorage.getItem(key)||"{}"); return {theme:s.theme==="dark"?"dark":"light",background:["grid","plain","dots"].includes(s.background)?s.background:"grid",color:/^#[0-9a-f]{6}$/i.test(s.color)?s.color:defaults.color,bar:["bottom","top","left","right"].includes(s.bar)?s.bar:"bottom",clock:["digital","minimal","hidden"].includes(s.clock)?s.clock:"digital"} } catch {return defaults}
}
export function useWorkspaceSettings() {
  const [settings,setSettings]=useState(defaults),[error,setError]=useState("")
  useEffect(()=>{const sync=()=>setSettings(read());sync();window.addEventListener("storage",sync);window.addEventListener("tlc-settings",sync);return()=>{window.removeEventListener("storage",sync);window.removeEventListener("tlc-settings",sync)}},[])
  function update(patch:Partial<WorkspaceSettings>) {try {const next={...read(),...patch};localStorage.setItem(key,JSON.stringify(next));setSettings(next);setError("");window.dispatchEvent(new Event("tlc-settings"))}catch{setError("Не удалось сохранить настройки в браузере.")}}
  return {settings,update,error}
}
