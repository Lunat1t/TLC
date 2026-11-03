"use client"

import * as React from 'react'
import {CONTROL_INPUTS, CONTROL_MIN, type ControlArea, type ControlInstance} from '@/lib/control-workspace'
import type {WorkspaceBlock} from '@/lib/workspace'

const LABELS:Record<string,string>={up:'▲',down:'▼',left:'◀',right:'▶',forward:'▲',backward:'▼',a:'A',b:'B',x:'X',y:'Y',l:'L',r:'R'}
type Props = {
  area: ControlArea
  controls: ControlInstance[]
  attachedPanels: WorkspaceBlock[]
  editing: boolean
  zoom: number
  errors?: Record<string,string>
  onAreaChange: (area: ControlArea) => void
  onControlChange: (control: ControlInstance) => void
  onDeleteControl?: (controlId: string) => void
  onDeleteArea?: (areaId: string) => void
  onCopyArea?: (areaId: string) => void
  onInput: (controlId:string,input:string,event:'pressed'|'released')=>void
  onCancel: ()=>void
}

type DirectionInput = 'up'|'down'|'left'|'right'
type InputProps = {
  control: ControlInstance
  editing: boolean
  errors: Record<string,string>
  onInput: Props['onInput']
  onCancel: Props['onCancel']
}

function dispatchDirectionChanges(controlId:string, previous:DirectionInput[], next:DirectionInput[], onInput:Props['onInput']) {
  for (const input of previous) if (!next.includes(input)) onInput(controlId,input,'released')
  for (const input of next) if (!previous.includes(input)) onInput(controlId,input,'pressed')
}

function GamepadStick({control,editing,errors,onInput,onCancel}:InputProps) {
  const [position,setPosition]=React.useState({x:0,y:0})
  const active=React.useRef<DirectionInput[]>([])
  const pointer=React.useRef<number|null>(null)
  const surface=React.useRef<HTMLDivElement>(null)
  const onInputRef=React.useRef(onInput)
  onInputRef.current=onInput
  const diameter=Math.max(132,Math.min(control.width-34,control.height-(editing?66:40)))
  const knobSize=Math.round(diameter*.38)
  const travel=Math.max(1,(diameter-knobSize)/2-5)
  const update=(e:React.PointerEvent<HTMLDivElement>)=>{
    const rect=surface.current?.getBoundingClientRect()
    if(!rect)return
    const screenTravel=Math.max(1,rect.width*travel/diameter)
    const x=Math.max(-1,Math.min(1,(e.clientX-(rect.left+rect.width/2))/screenTravel))
    const y=Math.max(-1,Math.min(1,(e.clientY-(rect.top+rect.height/2))/screenTravel))
    setPosition({x,y})
    const next:DirectionInput[]=[]
    if(Math.abs(x)>=.32)next.push(x<0?'left':'right')
    if(Math.abs(y)>=.32)next.push(y<0?'up':'down')
    const allowed=editing?[]:next.filter(input=>!errors[`${control.id}:${input}`])
    dispatchDirectionChanges(control.id,active.current,allowed,onInputRef.current)
    active.current=allowed
  }
  const start=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(editing||e.button!==0)return
    e.preventDefault();e.stopPropagation();pointer.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);update(e)
  }
  const move=(e:React.PointerEvent<HTMLDivElement>)=>{if(pointer.current===e.pointerId)update(e)}
  const release=(e:React.PointerEvent<HTMLDivElement>,cancelled=false)=>{
    if(pointer.current!==e.pointerId)return
    pointer.current=null;setPosition({x:0,y:0});dispatchDirectionChanges(control.id,active.current,[],onInputRef.current);active.current=[]
    if(cancelled)onCancel()
  }
  React.useEffect(()=>()=>{dispatchDirectionChanges(control.id,active.current,[],onInputRef.current);active.current=[]},[])
  const direction=(position.x<-.32?'← ':position.x>.32?'→ ':'')+(position.y<-.32?'↑':position.y>.32?'↓':'')
  return <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
    <div ref={surface} tabIndex={editing?-1:0} role="group" aria-label={`${control.label}, аналоговый стик`} aria-description="Перетащите ручку. По диагонали можно нажать два направления; отпустите для возврата в центр." aria-valuetext={direction||'центр'} onPointerDown={start} onPointerMove={move} onPointerUp={e=>release(e)} onPointerCancel={e=>release(e,true)} style={{position:'relative',width:diameter,height:diameter,flex:'0 0 auto',borderRadius:'50%',touchAction:'none',cursor:editing?'default':'grab',background:'radial-gradient(circle at 35% 30%, #f8fafb 0%, #e8ecef 55%, #d5dce0 100%)',border:'2px solid #bcc5ca',boxShadow:'inset 0 3px 9px #aab3b9, 0 2px 4px #aab3b9'}}>
      <div aria-hidden="true" style={{position:'absolute',left:'50%',top:'50%',width:knobSize,height:knobSize,borderRadius:'50%',transform:`translate(calc(-50% + ${position.x*travel}px), calc(-50% + ${position.y*travel}px))`,background:'linear-gradient(145deg,#fff 0%,#f0f1f2 72%,#d7dcdf 100%)',border:'1px solid #c2c7ca',boxShadow:'0 3px 5px #879197, inset 0 2px 2px #fff',transition:pointer.current===null?'transform 120ms ease-out':'none'}} />
    </div>
    {Object.entries(errors).filter(([key])=>key.startsWith(`${control.id}:`)).map(([key,error])=><span key={key} role="alert" className="text-center text-[10px] text-red-700">{error}</span>)}
  </div>
}

function GamepadDpad({control,editing,errors,onInput,onCancel}:InputProps) {
  const [pressed,setPressed]=React.useState<DirectionInput[]>([])
  const diameter=Math.max(140,Math.min(control.width-34,control.height-(editing?66:40)))
  const face=(input:DirectionInput)=>({up:'▲',down:'▼',left:'◀',right:'▶'}[input])
  const positions:Record<DirectionInput,React.CSSProperties>={up:{gridColumn:2,gridRow:1,borderRadius:'9px 9px 3px 3px'},left:{gridColumn:1,gridRow:2,borderRadius:'9px 3px 3px 9px'},right:{gridColumn:3,gridRow:2,borderRadius:'3px 9px 9px 3px'},down:{gridColumn:2,gridRow:3,borderRadius:'3px 3px 9px 9px'}}
  const begin=(e:React.PointerEvent<HTMLButtonElement>,input:DirectionInput)=>{
    if(editing||e.button!==0||errors[`${control.id}:${input}`])return
    e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId)
    setPressed(value=>value.includes(input)?value:[...value,input]);onInput(control.id,input,'pressed')
  }
  const release=(e:React.PointerEvent<HTMLButtonElement>,input:DirectionInput,cancelled=false)=>{
    e.stopPropagation();setPressed(value=>value.filter(item=>item!==input));onInput(control.id,input,'released');if(cancelled)onCancel()
  }
  const keyDown=(e:React.KeyboardEvent<HTMLButtonElement>,input:DirectionInput)=>{if(editing||errors[`${control.id}:${input}`]||(e.key!==' '&&e.key!=='Enter')||e.repeat)return;e.preventDefault();setPressed(value=>value.includes(input)?value:[...value,input]);onInput(control.id,input,'pressed')}
  const keyUp=(e:React.KeyboardEvent<HTMLButtonElement>,input:DirectionInput)=>{if(e.key!==' '&&e.key!=='Enter')return;e.preventDefault();setPressed(value=>value.filter(item=>item!==input));onInput(control.id,input,'released')}
  return <div className="flex min-h-0 flex-1 items-center justify-center">
    <div aria-label={`${control.label}, крестовина`} style={{width:diameter,height:diameter,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gridTemplateRows:'repeat(3,1fr)',gap:2,touchAction:'none'}}>
      {(['up','left','right','down'] as DirectionInput[]).map(input=>{
        const error=errors[`${control.id}:${input}`]
        return <button key={input} type="button" disabled={editing||Boolean(error)} aria-label={`${control.label}: ${({up:'вверх',down:'вниз',left:'влево',right:'вправо'})[input]}`} title={error} onPointerDown={e=>begin(e,input)} onPointerUp={e=>release(e,input)} onPointerCancel={e=>release(e,input,true)} onKeyDown={e=>keyDown(e,input)} onKeyUp={e=>keyUp(e,input)} style={{...positions[input],minWidth:44,minHeight:44,border:`1px solid ${pressed.includes(input)?'#8f989e':'#b8c0c4'}`,background:pressed.includes(input)?'linear-gradient(#d9dfe2,#eef0f1)':'linear-gradient(#fff,#e9edef)',boxShadow:pressed.includes(input)?'inset 0 2px 4px #9ca6ab':'inset 0 2px 2px #fff,0 2px 2px #abb4b9',fontSize:Math.max(18,diameter*.16),fontWeight:900,color:'#526169',touchAction:'none'}}>{face(input)}</button>
      })}
      <div aria-hidden="true" style={{gridColumn:2,gridRow:2,alignSelf:'center',justifySelf:'center',width:'60%',height:'60%',borderRadius:'50%',background:'linear-gradient(145deg,#fff,#e5e9eb)',border:'1px solid #bfc7cb',boxShadow:'inset 0 1px 2px #fff,0 1px 2px #9ba5aa',pointerEvents:'none'}} />
    </div>
    {(['up','down','left','right'] as DirectionInput[]).map(input=>errors[`${control.id}:${input}`]&&<span key={input} role="alert" className="text-center text-[10px] text-red-700">{errors[`${control.id}:${input}`]}</span>)}
  </div>
}

/** Visual container only: controls emit input events and never send motor commands. */
export function ControlAreaView({area,controls,attachedPanels,editing,zoom,errors={},onAreaChange,onControlChange,onDeleteControl,onDeleteArea,onCopyArea,onInput,onCancel}:Props) {
  const [preview,setPreview]=React.useState<ControlArea|null>(null)
  const [rename,setRename]=React.useState<{id:string,value:string}|null>(null)
  const [moving,setMoving]=React.useState<ControlInstance|null>(null)
  const [editError,setEditError]=React.useState("")
  const current=preview||area
  function dragArea(e:React.PointerEvent<HTMLElement>, resize:boolean) {
    if(!editing || e.button!==0)return
    e.stopPropagation(); const startX=e.clientX,startY=e.clientY;const start=area
    e.currentTarget.setPointerCapture(e.pointerId)
    const target=e.currentTarget
    const move=(ev:PointerEvent)=>{
      const dx=(ev.clientX-startX)/zoom,dy=(ev.clientY-startY)/zoom
      const minWidth=Math.max(320,...controls.map(c=>c.x+c.width),...attachedPanels.map(b=>b.x-area.x+(b.width||180)))
      const minHeight=Math.max(240,...controls.map(c=>c.y+c.height+44),...attachedPanels.map(b=>b.y-area.y+(b.height||132)+44))
      setPreview(resize?{...start,width:Math.min(2400,Math.max(minWidth,start.width+dx)),height:Math.min(2400,Math.max(minHeight,start.height+dy))}:{...start,x:start.x+dx,y:start.y+dy})
    }
    const end=(ev:PointerEvent)=>{
      target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',cancel)
      const dx=(ev.clientX-startX)/zoom,dy=(ev.clientY-startY)/zoom
      const minWidth=Math.max(320,...controls.map(c=>c.x+c.width),...attachedPanels.map(b=>b.x-area.x+(b.width||180)))
      const minHeight=Math.max(240,...controls.map(c=>c.y+c.height+44),...attachedPanels.map(b=>b.y-area.y+(b.height||132)+44))
      onAreaChange(resize?{...start,width:Math.min(2400,Math.max(minWidth,start.width+dx)),height:Math.min(2400,Math.max(minHeight,start.height+dy))}:{...start,x:start.x+dx,y:start.y+dy});setPreview(null)
    }
    const cancel=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',cancel);setPreview(null)}
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',cancel)
  }
  function dragControl(e:React.PointerEvent<HTMLElement>, control:ControlInstance) {
    if(!editing || e.button!==0)return
    e.stopPropagation();const startX=e.clientX,startY=e.clientY,target=e.currentTarget;target.setPointerCapture(e.pointerId)
    const candidate=(ev:PointerEvent)=>({...control,x:Math.max(0,Math.min(area.width-control.width,control.x+(ev.clientX-startX)/zoom)),y:Math.max(0,Math.min(area.height-44-control.height,control.y+(ev.clientY-startY)/zoom))})
    const move=(ev:PointerEvent)=>setMoving(candidate(ev))
    const end=(ev:PointerEvent)=>{const c=candidate(ev);cleanup();const overlap=controls.some(o=>o.id!==c.id&&c.x<o.x+o.width&&c.x+c.width>o.x&&c.y<o.y+o.height&&c.y+c.height>o.y);if(!overlap)onControlChange(c)}
    const cancel=()=>cleanup()
    const cleanup=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',cancel);setMoving(null)}
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',cancel)
  }
  function resizeControl(e:React.PointerEvent<HTMLElement>, control:ControlInstance) {
    if (!editing || e.button!==0) return
    e.stopPropagation(); const target=e.currentTarget, sx=e.clientX, sy=e.clientY
    target.setPointerCapture(e.pointerId)
    const candidate=(ev:PointerEvent)=>{const [w,h]=CONTROL_MIN[control.kind];return {...control,width:Math.min(area.width-control.x,Math.max(w,control.width+(ev.clientX-sx)/zoom)),height:Math.min(area.height-44-control.y,Math.max(h,control.height+(ev.clientY-sy)/zoom))}}
    const move=(ev:PointerEvent)=>setMoving(candidate(ev))
    const clean=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',cancel);setMoving(null)}
    const end=(ev:PointerEvent)=>{const c=candidate(ev);clean();if(!controls.some(o=>o.id!==c.id&&c.x<o.x+o.width&&c.x+c.width>o.x&&c.y<o.y+o.height&&c.y+c.height>o.y))onControlChange(c)}
    const cancel=()=>clean()
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',cancel)
  }
  const arrow=(key:string)=>({ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]} as Record<string,number[]>)[key]
  return <section data-canvas-block data-control-check={!editing || undefined} aria-label={area.title} style={{position:'absolute',zIndex:editing?undefined:30,left:current.x,top:current.y,width:current.width,height:current.height,border:'3px solid #c35117',borderRadius:16,background:'#fff8ef',overflow:'hidden'}}>
    <div tabIndex={editing?0:-1} role="button" aria-label={`Переместить область ${area.title}`} onKeyDown={e=>{const d=arrow(e.key);if(editing&&d){e.preventDefault();e.stopPropagation();onAreaChange({...area,x:area.x+d[0],y:area.y+d[1]})}}} onPointerDown={e=>dragArea(e,false)} style={{height:41,background:'#d35a1e',color:'white',padding:'8px 12px',fontWeight:800,touchAction:'none',cursor:editing?'grab':'default'}}>{area.title}{editing&&onDeleteArea&&<span style={{float:'right'}}><button type="button" aria-label="Удалить область" onPointerDown={e=>e.stopPropagation()} onClick={()=>onDeleteArea(area.id)}>×</button></span>}</div>
    <div style={{position:'relative',height:'calc(100% - 44px)'}}>
      {controls.map(original=>{const control=moving?.id===original.id?moving:original;return <div key={control.id} style={{position:'absolute',left:control.x,top:control.y,width:control.width,height:control.height,border:'2px solid #dfae87',borderRadius:12,background:'#fff',padding:6,overflow:'auto'}}>
        <div tabIndex={editing?0:-1} role="button" aria-label={`Переместить ${control.label}`} onKeyDown={e=>{const d=arrow(e.key);if(!editing||!d)return;e.preventDefault();e.stopPropagation();const c={...control,x:Math.max(0,Math.min(area.width-control.width,control.x+d[0])),y:Math.max(0,Math.min(area.height-44-control.height,control.y+d[1]))};if(!controls.some(o=>o.id!==c.id&&c.x<o.x+o.width&&c.x+c.width>o.x&&c.y<o.y+o.height&&c.y+c.height>o.y))onControlChange(c)}} onPointerDown={e=>dragControl(e,control)} style={{fontWeight:700,cursor:editing?'grab':'default',touchAction:'none'}}>{rename?.id===control.id ? <input autoFocus aria-label={`Название ${control.label}`} value={rename.value} maxLength={40} onPointerDown={e=>e.stopPropagation()} onChange={e=>setRename({id:control.id,value:e.target.value})} onBlur={()=>{if(rename.value.trim())onControlChange({...control,label:rename.value.trim()});setRename(null)}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur()}}/> : control.label}{editing&&<span style={{float:'right'}}><button type="button" aria-label={`Переименовать ${control.label}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>setRename({id:control.id,value:control.label})}>✎</button>{onDeleteControl&&<button type="button" aria-label={`Удалить ${control.label}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>onDeleteControl(control.id)}>×</button>}</span>}</div>
        {editing&&control.kind!=="legacy-buttons"&&<select aria-label={`Вид управления ${control.label}`} value={control.kind} onChange={e=>{const kind=e.target.value as ControlInstance['kind'];const [w,h]=CONTROL_MIN[kind];const next={...control,kind,width:Math.max(w,control.width),height:Math.max(h,control.height)};if(next.x+next.width>area.width||next.y+next.height>area.height-44||controls.some(o=>o.id!==next.id&&next.x<o.x+o.width&&next.x+next.width>o.x&&next.y<o.y+o.height&&next.y+next.height>o.y)){setEditError('Увеличьте область или освободите место.');return}setEditError('');onControlChange(next)}} className="max-w-full text-xs"><option value="drivetrain">Drivetrain</option><option value="joystick">Стик</option><option value="dpad">Крестовина</option><option value="motor">Мотор</option><option value="motor-group">Группа моторов</option></select>}
        {control.kind==="joystick"?<GamepadStick control={control} editing={editing} errors={errors} onInput={onInput} onCancel={onCancel}/>:control.kind==="dpad"?<GamepadDpad control={control} editing={editing} errors={errors} onInput={onInput} onCancel={onCancel}/>:<div style={{display:'flex',flexWrap:'wrap',gap:4}}>{CONTROL_INPUTS[control.kind].map(input=>{
          const error=errors[`${control.id}:${input}`]
          return <button key={input} type="button" disabled={editing||Boolean(error)} aria-label={`${control.label}: ${LABELS[input]||input}`} title={error} onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);onInput(control.id,input,'pressed')}} onPointerUp={e=>{e.stopPropagation();onInput(control.id,input,'released')}} onPointerCancel={onCancel} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();onInput(control.id,input,'pressed')}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();onInput(control.id,input,'released')}}} style={{minWidth:44,minHeight:44,borderRadius:8,background:error?'#fee2e2':'#ffe4c8',border:'1px solid #b75c28',fontWeight:800}}>{LABELS[input]||input}{error&&<span aria-label={`Ошибка: ${error}`}> ⚠</span>}</button>
        })}</div>}
        {editing&&<button type="button" aria-label={`Изменить размер ${control.label}`} onPointerDown={e=>resizeControl(e,control)} style={{position:'absolute',right:0,bottom:0,width:28,height:28,touchAction:'none',cursor:'nwse-resize'}}>◢</button>}
        {CONTROL_INPUTS[control.kind].some(input=>errors[`${control.id}:${input}`])&&<p role="alert" style={{color:'#991b1b',fontSize:12}}>{CONTROL_INPUTS[control.kind].map(input=>errors[`${control.id}:${input}`]).find(Boolean)}</p>}
      </div>})}
    </div>
    {editError&&<p role="alert" style={{position:'absolute',left:8,bottom:2,color:'#991b1b',background:'white',fontSize:12}}>{editError}</p>}
    {editing&&<button type="button" aria-label="Изменить размер области" onPointerDown={e=>dragArea(e,true)} style={{position:'absolute',right:0,bottom:0,width:32,height:32,touchAction:'none',cursor:'nwse-resize'}}>◢</button>}
  </section>
}
