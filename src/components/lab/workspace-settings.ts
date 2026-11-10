"use client"
import { useAccountWorkspace } from "./account-workspace"
export type WorkspaceSettings = { theme: "light"|"dark"; background: "grid"|"plain"|"dots"; color: string; bar: "bottom"|"top"|"left"|"right"; clock: "digital"|"minimal"|"hidden" }
export const defaults: WorkspaceSettings = {theme:"light",background:"grid",color:"#e6f0fa",bar:"bottom",clock:"digital"}
function clean(value:unknown):WorkspaceSettings {
 const s=(value&&typeof value==='object'?value:{}) as Partial<WorkspaceSettings>
 return {theme:s.theme==='dark'?'dark':'light',background:s.background&&['grid','plain','dots'].includes(s.background)?s.background:'grid',color:typeof s.color==='string'&&/^#[0-9a-f]{6}$/i.test(s.color)?s.color:defaults.color,bar:s.bar&&['bottom','top','left','right'].includes(s.bar)?s.bar:'bottom',clock:s.clock&&['digital','minimal','hidden'].includes(s.clock)?s.clock:'digital'}
}
export function useWorkspaceSettings(){const store=useAccountWorkspace();return {settings:clean(store.values.settings),ready:store.ready,error:store.error,update:(patch:Partial<WorkspaceSettings>)=>store.update('settings',{...clean(store.values.settings),...patch})}}
