import type { RobotProject } from './projects'
import { isLibraryBlockType } from './workspace.ts'

export type ControlKind = 'drivetrain' | 'motor' | 'motor-group' | 'legacy-buttons' | 'motor-panel'
export interface ControlArea { id: string; sheetId: string; title: string; x: number; y: number; width: number; height: number }
export interface ControlInstance { id: string; areaId: string; kind: ControlKind; label: string; x: number; y: number; width: number; height: number; keyBindings?: Record<string, string>; inputs?: readonly string[] }
export interface ControlLayout { version: 1; areas: ControlArea[]; controls: ControlInstance[]; migration?: {source: 'legacy-button-events'; version: 1} }
export const CONTROL_INPUTS: Record<ControlKind, readonly string[]> = {
  drivetrain: ['up', 'down', 'left', 'right'], motor: ['forward', 'backward'],
  'motor-group': ['forward', 'backward'], 'legacy-buttons': ['up','down','left','right','a','b','x','y','l','r'], 'motor-panel': ['blue','red','green','yellow'],
}
export const CONTROL_MIN: Record<ControlKind, [number, number]> = {
  drivetrain: [160, 160], motor: [144, 96], 'motor-group': [144, 96], 'legacy-buttons': [300, 200], 'motor-panel': [144, 112],
}
export const EMPTY_LAYOUT: ControlLayout = {version: 1, areas: [], controls: []}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const label = (v: unknown) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 40
const id = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 128
export function validateControlLayout(raw: unknown, sheetIds: readonly string[]): ControlLayout {
  if (!obj(raw) || raw.version !== 1 || !Array.isArray(raw.areas) || !Array.isArray(raw.controls)) throw new Error('Неподдерживаемая версия области управления.')
  if (raw.areas.length > 12) throw new Error('Можно добавить не более 12 областей управления.')
  const rawControls = raw.controls
  const ids = new Set<string>()
  const areaSheets = new Set<string>()
  const areas: ControlArea[] = raw.areas.map((a: unknown) => {
    if (!obj(a) || !id(a.id) || ids.has(a.id as string) || !id(a.sheetId) || !sheetIds.includes(a.sheetId as string) || !label(a.title) || ![a.x,a.y,a.width,a.height].every(number) || Number(a.width)<320 || Number(a.height)<240 || Number(a.width)>2400 || Number(a.height)>2400) throw new Error('Неверная область управления.')
    if (areaSheets.has(a.sheetId as string)) throw new Error('На одном листе можно создать только одну область «Управление».')
    areaSheets.add(a.sheetId as string)
    ids.add(a.id as string)
    return {id:a.id as string,sheetId:a.sheetId as string,title:(a.title as string).trim(),x:a.x as number,y:a.y as number,width:a.width as number,height:a.height as number}
  })
  const controls: ControlInstance[] = rawControls.map((c: unknown) => {
    if (!obj(c) || !id(c.id) || ids.has(c.id as string) || !id(c.areaId) || !label(c.label) || c.kind !== 'motor-panel' || ![c.x,c.y,c.width,c.height].every(number)) throw new Error('Неверный элемент управления.')
    const area=areas.find(a=>a.id===c.areaId); const kind: ControlKind = 'motor-panel'; const [w,h]=CONTROL_MIN[kind]
    if (!area || Number(c.x)<0 || Number(c.y)<0 || Number(c.width)<w || Number(c.height)<h || Number(c.x)+Number(c.width)>area.width || Number(c.y)+Number(c.height)>area.height-44) throw new Error('Элемент управления вне области.')
    if (rawControls.filter((v:unknown)=>obj(v)&&v.areaId===c.areaId).length>12) throw new Error('Можно добавить не более 12 элементов в область.')
    ids.add(c.id as string)
    let keyBindings: Record<string,string> | undefined
    if (c.keyBindings !== undefined) {
      if (!obj(c.keyBindings) || Object.entries(c.keyBindings).some(([k,v])=>!CONTROL_INPUTS[kind].includes(k) || typeof v !== 'string' || !v || v.length>40)) throw new Error('Неверная клавиша управления.')
      keyBindings=c.keyBindings as Record<string,string>
    }
    return {id:c.id as string,areaId:c.areaId as string,kind,label:(c.label as string).trim(),x:c.x as number,y:c.y as number,width:c.width as number,height:c.height as number,...(keyBindings?{keyBindings}:{})}
  })
  for (let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
    const a=controls[i],b=controls[j]
    if(a.areaId===b.areaId && a.x<b.x+b.width && a.x+a.width>b.x && a.y<b.y+b.height && a.y+a.height>b.y) throw new Error('Элементы управления перекрываются.')
  }
  return {version:1,areas,controls,...(obj(raw.migration)&&raw.migration.source==='legacy-button-events'&&raw.migration.version===1?{migration:{source:'legacy-button-events',version:1}}:{})}
}

/** Removes blocks absent from the editor palette while retaining unknown workspace fields. */
export function migrateControlWorkspace(project: RobotProject): {project: RobotProject; changed: boolean} {
  const ws = project.workspace
  if (!ws) return {project,changed:false}
  const sheets = Array.isArray(ws.sheets) && ws.sheets.length ? ws.sheets : [{id:'sheet-main',name:'Основная',blocks:Array.isArray(ws.blocks)?ws.blocks:[]}]
  const sheetIds=sheets.filter(obj).map(s=>String(s.id))
  let layoutInput = ws.controlLayout
  const duplicateAreaMap = new Map<string,string>()
  if (obj(ws.controlLayout) && Array.isArray(ws.controlLayout.areas)) {
    const primaryBySheet = new Map<string,string>()
    const uniqueAreas = ws.controlLayout.areas.filter((area: unknown) => {
      if (!obj(area) || typeof area.id !== 'string' || typeof area.sheetId !== 'string') return true
      const primary = primaryBySheet.get(area.sheetId)
      if (!primary) { primaryBySheet.set(area.sheetId,area.id); return true }
      duplicateAreaMap.set(area.id,primary)
      return false
    })
    if (duplicateAreaMap.size) layoutInput = {...ws.controlLayout,areas:uniqueAreas,controls:Array.isArray(ws.controlLayout.controls) ? ws.controlLayout.controls.filter((c: unknown) => !obj(c) || !duplicateAreaMap.has(String(c.areaId))) : ws.controlLayout.controls}
  }
  // Remove only known retired controls during migration, never in validation.
  // Malformed or unknown controls must fail before the original project is saved.
  if (obj(layoutInput) && Array.isArray(layoutInput.controls)) {
    const retired = new Set(['drivetrain', 'motor', 'motor-group', 'legacy-buttons', 'joystick', 'dpad'])
    layoutInput = {...layoutInput, controls: layoutInput.controls.filter((c: unknown) => !obj(c) || !retired.has(String(c.kind)))}
  }
  const cleanedLayout = layoutInput !== undefined ? validateControlLayout(layoutInput,sheetIds) : undefined
  const originalControlCount = obj(ws.controlLayout) && Array.isArray(ws.controlLayout.controls) ? ws.controlLayout.controls.length : 0
  const originalAreaCount = obj(ws.controlLayout) && Array.isArray(ws.controlLayout.areas) ? ws.controlLayout.areas.length : 0
  const controlsChanged = (cleanedLayout !== undefined && cleanedLayout.controls.length !== originalControlCount) || (cleanedLayout !== undefined && cleanedLayout.areas.length !== originalAreaCount)
  const stripUnlisted = (rawBlocks: unknown[]): unknown[] => {
    const removed = new Set<string>()
    for (const block of rawBlocks) {
      if (obj(block) && typeof block.id === 'string' && !isLibraryBlockType(block.type)) removed.add(block.id)
    }
    return rawBlocks
      .filter(block => !(obj(block) && typeof block.id === 'string' && removed.has(block.id)))
      .map(block => {
        if (!obj(block) || typeof block.parentId !== 'string' || !removed.has(block.parentId)) return block
        const detached={...block}
        delete detached.parentId
        delete detached.branch
        return detached
      })
  }
  const migratedSheets = sheets.map(sheet => !obj(sheet) || !Array.isArray(sheet.blocks) ? sheet : {...sheet,blocks:stripUnlisted(sheet.blocks).map((block: unknown) => obj(block) && typeof block.controlAreaId === 'string' && duplicateAreaMap.has(block.controlAreaId) ? {...block,controlAreaId:duplicateAreaMap.get(block.controlAreaId)} : block)})
  const hasSheets = Array.isArray(ws.sheets) && ws.sheets.length > 0
  const oldBlocks = !hasSheets && Array.isArray(ws.blocks) ? stripUnlisted(ws.blocks) : ws.blocks
  const changed = duplicateAreaMap.size > 0 || migratedSheets.some((sheet,index) => {
    const previous = sheets[index]
    return obj(sheet) && Array.isArray(sheet.blocks) && obj(previous) && Array.isArray(previous.blocks) && (sheet.blocks.length !== previous.blocks.length || JSON.stringify(sheet.blocks) !== JSON.stringify(previous.blocks))
  })
    || (!hasSheets && Array.isArray(ws.blocks) && Array.isArray(oldBlocks) && oldBlocks.length !== ws.blocks.length)
    || controlsChanged
  if (!changed) return {project,changed:false}
  return {project:{...project,workspace:{...ws,...(hasSheets?{sheets:migratedSheets}:{blocks:oldBlocks}),...(cleanedLayout?{controlLayout:cleanedLayout}:{})}},changed:true}
}

/** Import only visual layout; legacy motor ports and speeds are deliberately ignored. */
export function importLegacyControls(raw: unknown, layout: ControlLayout, sheetId: string, createId:()=>string): ControlLayout {
  if (!obj(raw) || raw.version!==1 || !Array.isArray(raw.devices) || !Array.isArray(raw.moduleLayout)) throw new Error('Старая раскладка не найдена или повреждена.')
  if (layout.areas.length>=12 || raw.devices.length>12) throw new Error('Превышен лимит элементов управления.')
  const sourceDevices=raw.devices, sourcePositions=raw.moduleLayout
  const areaId=createId(), width=960, height=Math.min(2400,Math.max(360,Math.ceil(sourceDevices.length/3)*240+44))
  const area:ControlArea={id:areaId,sheetId,title:'Импортированное управление',x:0,y:0,width,height}
  const controls:ControlInstance[]=[]
  for (const value of sourceDevices) {
    if (!obj(value) || !id(value.id) || !['drivetrain','motor','motor-group'].includes(String(value.type))) throw new Error('Старая раскладка содержит неподдерживаемый элемент.')
    const pos=sourcePositions.find((p:unknown)=>obj(p)&&p.deviceId===value.id)
    if (!obj(pos) || !number(pos.x) || !number(pos.y) || Number(pos.x)<0 || Number(pos.x)>1 || Number(pos.y)<0 || Number(pos.y)>1) throw new Error('Не удалось прочитать положение элемента.')
    const [minW,minH]=CONTROL_MIN['motor-panel'], w=Math.max(minW,Math.min(480,number(pos.width)?Number(pos.width):206)), h=Math.max(minH,Math.min(420,number(pos.height)?Number(pos.height):176))
    const fits=(x:number,y:number)=>!controls.some(c=>x<c.x+c.width&&x+w>c.x&&y<c.y+c.height&&y+h>c.y)
    let x=Math.round(Number(pos.x)*(width-w)),y=Math.round(Number(pos.y)*(height-44-h))
    if(!fits(x,y)) {
      let found=false
      for(let yy=0;yy+h<=height-44&&!found;yy+=16)for(let xx=0;xx+w<=width;xx+=16)if(fits(xx,yy)){x=xx;y=yy;found=true;break}
      if(!found)throw new Error('Не хватает места для старой раскладки.')
    }
    controls.push({id:createId(),areaId,kind:'motor-panel',label:label(value.name)?(value.name as string).trim():'Управление',x,y,width:w,height:h})
  }
  const next:ControlLayout={...layout,areas:[...layout.areas,area],controls:[...layout.controls,...controls]}
  validateControlLayout(next,[...new Set([...layout.areas.map(a=>a.sheetId),sheetId])])
  return next
}

/** Copy a sheet with fresh internal IDs; external targets stay attached to their originals. */
export function cloneControlSheet(state: import('./workspace').SheetState, layout:ControlLayout, sheetId:string, newSheetId:string, name:string, createId:()=>string): {state:import('./workspace').SheetState;layout:ControlLayout} {
  const source=state.sheets.find(s=>s.id===sheetId)
  if(!source)throw new Error('Лист не найден.')
  if(state.sheets.length>=32)throw new Error('Можно создать не больше 32 листов.')
  if(!name.trim()||name.trim().length>40||state.sheets.some(s=>s.name.toLocaleLowerCase()===name.trim().toLocaleLowerCase()))throw new Error('Выберите другое название листа.')
  if(state.sheets.some(s=>s.id===newSheetId))throw new Error('Лист уже существует.')
  const sourceAreas=layout.areas.filter(a=>a.sheetId===sheetId),areaIds=new Map(sourceAreas.map(a=>[a.id,createId()]))
  const sourceControls=layout.controls.filter(c=>areaIds.has(c.areaId)),controlIds=new Map(sourceControls.map(c=>[c.id,createId()]))
  const blockIds=new Map(source.blocks.map(b=>[b.id,createId()]))
  const blocks=source.blocks.map(b=>({...b,id:blockIds.get(b.id)!,...(b.parentId?{parentId:blockIds.get(b.parentId)||b.parentId}:{}),...(b.controlAreaId?{controlAreaId:areaIds.get(b.controlAreaId)||b.controlAreaId}:{}),...(b.target?{target:{...b.target,controlId:controlIds.get(b.target.controlId)||b.target.controlId}}:{})}))
  const copied={...source,id:newSheetId,name:name.trim(),blocks}
  const nextState={...state,activeSheetId:newSheetId,sheets:[...state.sheets,copied]}
  const nextLayout:ControlLayout={...layout,areas:[...layout.areas,...sourceAreas.map(a=>({...a,id:areaIds.get(a.id)!,sheetId:newSheetId}))],controls:[...layout.controls,...sourceControls.map(c=>({...c,id:controlIds.get(c.id)!,areaId:areaIds.get(c.areaId)!}))]}
  validateControlLayout(nextLayout,nextState.sheets.map(s=>s.id))
  return {state:nextState,layout:nextLayout}
}
