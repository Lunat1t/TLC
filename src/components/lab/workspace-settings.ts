"use client"
import { useAccountWorkspace } from "./account-workspace"
export type DockShortcut={href:string;label:string}
export function cleanShortcut(value:unknown):DockShortcut|null {
 if(!value||typeof value!=='object')return null
 const item=value as DockShortcut
 if(typeof item.href!=='string'||typeof item.label!=='string'||!item.label.trim())return null
 try{if(!item.href.startsWith('/')&&!/^https?:\/\//i.test(item.href))return null;const url=new URL(item.href,'https://tlc.local');if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;return {href:url.origin==='https://tlc.local'?url.pathname+url.search+url.hash:url.href,label:item.label.slice(0,64)}}catch{return null}
}
export type WorkspaceSettings = { desktopCount?:number; activeDesktop?:number; wallpaper?:string; wallpaperFit?:"cover"|"contain"; dockPins?:DockShortcut[]; theme: "light"|"dark"; background: "grid"|"plain"|"dots"|"wallpaper"; color: string; bar: "bottom"|"top"|"left"|"right"; clock: "digital"|"minimal"|"hidden" }
export const defaults: WorkspaceSettings = {wallpaper:"",wallpaperFit:"cover",theme:"light",background:"grid",color:"#e6f0fa",bar:"bottom",clock:"digital"}
function clean(value:unknown):WorkspaceSettings {
 const s=(value&&typeof value==='object'?value:{}) as Partial<WorkspaceSettings>
 return {desktopCount:Number.isInteger(s.desktopCount)?Math.max(1,Math.min(6,s.desktopCount!)):3,activeDesktop:Number.isInteger(s.activeDesktop)?Math.max(0,Math.min((s.desktopCount||3)-1,s.activeDesktop!)):0,wallpaper:typeof s.wallpaper==='string'&&s.wallpaper.length<=900_000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(s.wallpaper)?s.wallpaper:'',wallpaperFit:s.wallpaperFit==='contain'?'contain':'cover',dockPins:Array.isArray(s.dockPins)?s.dockPins.map(cleanShortcut).filter((p):p is DockShortcut=>p!==null).slice(0,10):[],theme:s.theme==='dark'?'dark':'light',background:s.background&&['grid','plain','dots','wallpaper'].includes(s.background)?s.background:'grid',color:typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)?s.color:defaults.color,bar:s.bar&&['bottom','top','left','right'].includes(s.bar)?s.bar:'bottom',clock:s.clock&&['digital','minimal','hidden'].includes(s.clock)?s.clock:'digital'}
}
export function useWorkspaceSettings(){const store=useAccountWorkspace();return {settings:clean(store.values.settings),ready:store.ready,error:store.error,update:(patch:Partial<WorkspaceSettings>)=>store.update('settings',{...clean(store.values.settings),...patch})}}
