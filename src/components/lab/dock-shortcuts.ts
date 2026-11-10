"use client"
import { useWorkspaceSettings, cleanShortcut, type DockShortcut } from './workspace-settings'
const fixedPaths=['/dashboard','/files','/settings','/instructions','/avatar','/admin/instructions/drive']
export const DOCK_DRAG_TYPE='application/x-tlc-shortcut'
export function useDockShortcuts(){const {settings,update,ready}=useWorkspaceSettings();return {pins:(settings.dockPins||[]).filter(p=>!fixedPaths.includes(p.href)),ready,pin:(value:DockShortcut)=>{const item=cleanShortcut(value);if(!item||!ready)return false;if(fixedPaths.includes(item.href))return true;const current=(settings.dockPins||[]).filter(p=>!fixedPaths.includes(p.href));if(current.some(p=>p.href===item.href))return true;if(current.length>=10)return false;return update({dockPins:[...current,item]})},unpin:(href:string)=>update({dockPins:(settings.dockPins||[]).filter(p=>p.href!==href)})}}
