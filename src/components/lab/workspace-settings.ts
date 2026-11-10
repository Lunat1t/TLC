"use client"
import { useAccountWorkspace } from "./account-workspace"
export type DockShortcut={href:string;label:string}
export function cleanShortcut(value:unknown):DockShortcut|null {
 if(!value||typeof value!=='object')return null
 const item=value as DockShortcut
 if(typeof item.href!=='string'||typeof item.label!=='string'||!item.label.trim())return null
 try{if(!item.href.startsWith('/')&&!/^https?:\/\//i.test(item.href))return null;const url=new URL(item.href,'https://tlc.local');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;return {href:url.origin==='https://tlc.local'?url.pathname+url.search+url.hash:url.href,label:item.label.slice(0,64)}}catch{return null}
}
export type WorkspaceSettings = { dockPins?:DockShortcut[]; theme: "light"|"dark"; background: "grid"|"plain"|"dots"; color: string; bar: "bottom"|"top"|"left"|"right"; clock: "digital"|"minimal"|"hidden" }
export const defaults: WorkspaceSettings = {theme:"light",background:"grid",color:"#e6f0fa",bar:"bottom",clock:"digital"}
function clean(value:unknown):WorkspaceSettings {
 const s=(value&&typeof value==='object'?value:{}) as Partial<WorkspaceSettings>
 return {dockPins:Array.isArray(s.dockPins)?s.dockPins.map(cleanShortcut).filter((p):p is DockShortcut=>p!==null).slice(0,10):[],theme:s.theme==='dark'?'dark':'light',background:s.background&&['grid','plain','dots'].includes(s.background)?s.background:'grid',color:typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)?s.color:defaults.color,bar:s.bar&&['bottom','top','left','right'].includes(s.bar)?s.bar:'bottom',clock:s.clock&&['digital','minimal','hidden'].includes(s.clock)?s.clock:'digital'}
}
export function useWorkspaceSettings(){const store=useAccountWorkspace();return {settings:clean(store.values.settings),ready:store.ready,error:store.error,update:(patch:Partial<WorkspaceSettings>)=>store.update('settings',{...clean(store.values.settings),...patch})}}
