import type { RobotProject } from './projects'

export type ControlKind = 'drivetrain' | 'motor' | 'motor-group' | 'legacy-buttons' | 'motor-panel' | 'joystick' | 'dpad'
export interface ControlArea { id: string; sheetId: string; title: string; x: number; y: number; width: number; height: number }
export interface ControlInstance { id: string; areaId: string; kind: ControlKind; label: string; x: number; y: number; width: number; height: number; keyBindings?: Record<string, string>; inputs?: readonly string[] }
export interface ControlLayout { version: 1; areas: ControlArea[]; controls: ControlInstance[]; migration?: {source: 'legacy-button-events'; version: 1} }
export const CONTROL_INPUTS: Record<ControlKind, readonly string[]> = {
  drivetrain: ['up', 'down', 'left', 'right'], motor: ['forward', 'backward'],
  'motor-group': ['forward', 'backward'], 'legacy-buttons': ['up','down','left','right','a','b','x','y','l','r'], 'motor-panel': ['blue','red','green','yellow'],
  joystick: ['up','down','left','right'], dpad: ['up','down','left','right'],
}
export const CONTROL_MIN: Record<ControlKind, [number, number]> = {
  drivetrain: [160, 160], motor: [144, 96], 'motor-group': [144, 96], 'legacy-buttons': [300, 200], 'motor-panel': [144, 112],
  joystick: [160, 160], dpad: [160, 160],
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
  const areas: ControlArea[] = raw.areas.map((a: unknown) => {
    if (!obj(a) || !id(a.id) || ids.has(a.id as string) || !id(a.sheetId) || !sheetIds.includes(a.sheetId as string) || !label(a.title) || ![a.x,a.y,a.width,a.height].every(number) || Number(a.width)<320 || Number(a.height)<240 || Number(a.width)>2400 || Number(a.height)>2400) throw new Error('Неверная область управления.')
    ids.add(a.id as string)
    return {id:a.id as string,sheetId:a.sheetId as string,title:(a.title as string).trim(),x:a.x as number,y:a.y as number,width:a.width as number,height:a.height as number}
  })
  const controls: ControlInstance[] = raw.controls.map((c: unknown) => {
    if (!obj(c) || !id(c.id) || ids.has(c.id as string) || !id(c.areaId) || !label(c.label) || typeof c.kind !== 'string' || !Object.hasOwn(CONTROL_INPUTS,c.kind) || ![c.x,c.y,c.width,c.height].every(number)) throw new Error('Неверный элемент управления.')
    const area=areas.find(a=>a.id===c.areaId); const kind=c.kind as ControlKind; const [w,h]=CONTROL_MIN[kind]
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

/** Pure migration: never touches storage or drops unknown workspace fields. */
export function migrateControlWorkspace(project: RobotProject): {project: RobotProject; changed: boolean} {
  const ws = project.workspace
  if (!ws) return {project,changed:false}
  const sheets = Array.isArray(ws.sheets) && ws.sheets.length ? ws.sheets : [{id:'sheet-main',name:'Основная',blocks:Array.isArray(ws.blocks)?ws.blocks:[]}]
  const sheetIds=sheets.filter(obj).map(s=>String(s.id))
  if (ws.controlLayout !== undefined) validateControlLayout(ws.controlLayout,sheetIds)
  const missing = sheets.flatMap(s=>obj(s)&&Array.isArray(s.blocks)?s.blocks.filter((b:unknown)=>obj(b)&&b.type==='button'&&!obj(b.target)):[])
  if (!missing.length) return {project,changed:false}
  if (ws.controlLayout !== undefined) throw new Error('Старые обработчики требуют ручного восстановления.')
  const first = sheets.find(s=>obj(s)&&Array.isArray(s.blocks)&&s.blocks.some((b:unknown)=>obj(b)&&b.type==='button'&&!obj(b.target))) as Record<string,unknown>
  const prefix=`legacy-${project.id}`; const areaId=prefix+'-area', controlId=prefix+'-control'
  const layout:ControlLayout={version:1,areas:[{id:areaId,sheetId:String(first.id),title:'Управление',x:0,y:0,width:640,height:360}],controls:[{id:controlId,areaId,kind:'legacy-buttons',label:'Пульт',x:0,y:0,width:300,height:200}],migration:{source:'legacy-button-events',version:1}}
  const migrated=sheets.map(s=>!obj(s)?s:{...s,blocks:Array.isArray(s.blocks)?s.blocks.map((b:unknown)=>{
    if(!obj(b)||b.type!=='button'||obj(b.target)) return b
    if(typeof b.button!=='string'||!CONTROL_INPUTS['legacy-buttons'].includes(b.button)) throw new Error('Неизвестная старая кнопка. Исходный проект сохранён.')
    return {...b,target:{controlId,input:b.button}}
  }):s.blocks})
  return {project:{...project,workspace:{...ws,sheets:migrated,activeSheetId:ws.activeSheetId || String(first.id),controlLayout:layout}},changed:true}
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
    const kind=value.type as ControlKind, pos=sourcePositions.find((p:unknown)=>obj(p)&&p.deviceId===value.id)
    if (!obj(pos) || !number(pos.x) || !number(pos.y) || Number(pos.x)<0 || Number(pos.x)>1 || Number(pos.y)<0 || Number(pos.y)>1) throw new Error('Не удалось прочитать положение элемента.')
    const [minW,minH]=CONTROL_MIN[kind], w=Math.max(minW,Math.min(480,number(pos.width)?Number(pos.width):206)), h=Math.max(minH,Math.min(420,number(pos.height)?Number(pos.height):176))
    const fits=(x:number,y:number)=>!controls.some(c=>x<c.x+c.width&&x+w>c.x&&y<c.y+c.height&&y+h>c.y)
    let x=Math.round(Number(pos.x)*(width-w)),y=Math.round(Number(pos.y)*(height-44-h))
    if(!fits(x,y)) {
      let found=false
      for(let yy=0;yy+h<=height-44&&!found;yy+=16)for(let xx=0;xx+w<=width;xx+=16)if(fits(xx,yy)){x=xx;y=yy;found=true;break}
      if(!found)throw new Error('Не хватает места для старой раскладки.')
    }
    controls.push({id:createId(),areaId,kind,label:label(value.name)?(value.name as string).trim():'Управление',x,y,width:w,height:h})
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

/** A copied area has new control IDs; existing handlers keep their original targets. */
export function cloneControlArea(layout:ControlLayout,areaId:string,createId:()=>string):ControlLayout {
  const area=layout.areas.find(a=>a.id===areaId)
  if(!area)throw new Error('Область не найдена.')
  if(layout.areas.length>=12)throw new Error('Можно добавить не более 12 областей управления.')
  const nextId=createId(), newArea={...area,id:nextId,x:area.x+32,y:area.y+32}
  const copied=layout.controls.filter(c=>c.areaId===areaId).map(c=>({...c,id:createId(),areaId:nextId}))
  const result:ControlLayout={...layout,areas:[...layout.areas,newArea],controls:[...layout.controls,...copied]}
  validateControlLayout(result,[...new Set(result.areas.map(a=>a.sheetId))])
  return result
}
