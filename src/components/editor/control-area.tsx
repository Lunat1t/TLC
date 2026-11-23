"use client"

import * as React from 'react'
import {CONTROL_INPUTS, CONTROL_MIN, DIRECTION_CONTROLS, isDirectionControl, isPlaceableControl, type ControlArea, type ControlInstance} from '@/lib/control-workspace'
import type {WorkspaceBlock} from '@/lib/workspace'
import {DEFAULT_DRIVE_SETTINGS} from '@/lib/controller-program'
import {SENSOR_PORTS} from '@/lib/block-registry'
import {AlertTriangle, Waves} from 'lucide-react'
import {DirectionButtons, DriveSettingsButton} from './direction-control'
import {DisplayStreamView} from './display-stream-view'

const LABELS:Record<string,string>={up:'▲',down:'▼',left:'◀',right:'▶',forward:'▲',backward:'▼',a:'A',b:'B',x:'X',y:'Y',l:'L',r:'R'}
type Props = {
  area: ControlArea
  controls: ControlInstance[]
  attachedPanels: WorkspaceBlock[]
  editing: boolean
  inputActive: boolean
  zoom: number
  errors?: Record<string,string>
  isLiveRobot?: boolean
  sensorPorts?: readonly string[]
  sensorPortsKnown?: boolean
  sensorDistances?: Record<string, number | null>
  onSimulateDistance?: (port: string, cm: number | null) => void
  onAreaChange: (area: ControlArea) => void
  onControlChange: (control: ControlInstance) => void
  onDeleteControl?: (controlId: string) => void
  onDeleteArea?: (areaId: string) => void
  onInput: (controlId:string,input:string,event:'pressed'|'released')=>void
  onCancel: ()=>void
}

/** Visual container only: controls emit input events and never send motor commands. */
export function ControlAreaView({area,controls,attachedPanels,editing,inputActive,zoom,errors={},isLiveRobot=false,sensorPorts=[],sensorPortsKnown=false,sensorDistances={},onSimulateDistance,onAreaChange,onControlChange,onDeleteControl,onDeleteArea,onInput,onCancel}:Props) {
  const errorDialog = React.useRef<HTMLDialogElement>(null)
  const [selectedError, setSelectedError] = React.useState('')
  const errorTitleId = React.useId()
  const [preview,setPreview]=React.useState<ControlArea|null>(null)
  const [rename,setRename]=React.useState<{id:string,value:string}|null>(null)
  const [moving,setMoving]=React.useState<ControlInstance|null>(null)
  const current=preview||area
  const showDriveSettings = editing && controls.some(control => isDirectionControl(control.kind))
  const occupiedByPanel = (control: ControlInstance) => isPlaceableControl(control.kind) && attachedPanels.some(panel => {
    const left = panel.x - area.x
    const top = panel.y - area.y - 44
    return control.x < left + (panel.width || 180) && control.x + control.width > left
      && control.y < top + (panel.height || 132) && control.y + control.height > top
  })
  const fits = (control: ControlInstance) => !occupiedByPanel(control) && !controls.some(other =>
    other.id !== control.id && control.x < other.x + other.width && control.x + control.width > other.x
      && control.y < other.y + other.height && control.y + control.height > other.y)
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
    const end=(ev:PointerEvent)=>{const c=candidate(ev);cleanup();if(fits(c))onControlChange(c)}
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
    const end=(ev:PointerEvent)=>{const c=candidate(ev);clean();if(fits(c))onControlChange(c)}
    const cancel=()=>clean()
    target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',cancel)
  }
  const arrow=(key:string)=>({ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]} as Record<string,number[]>)[key]
  return <section data-canvas-block data-control-check={!editing || undefined} aria-label={area.title} style={{position:'absolute',zIndex:editing?undefined:30,left:current.x,top:current.y,width:current.width,height:current.height,border:'3px solid #c35117',borderRadius:16,background:'#fff8ef',overflow:'hidden'}}>
    <div tabIndex={editing?0:-1} role="button" aria-label={`Переместить область ${area.title}`} onKeyDown={e=>{const d=arrow(e.key);if(editing&&d){e.preventDefault();e.stopPropagation();onAreaChange({...area,x:area.x+d[0],y:area.y+d[1]})}}} onPointerDown={e=>dragArea(e,false)} style={{height:41,background:'#d35a1e',color:'white',padding:'8px 12px',fontWeight:800,touchAction:'none',cursor:editing?'grab':'default',position:'relative'}}>{area.title}{showDriveSettings && (
      <DriveSettingsButton settings={area.drive || DEFAULT_DRIVE_SETTINGS} onChange={drive => onAreaChange({...area, drive})} />
    )}{editing&&onDeleteArea&&<span style={{float:'right'}}><button type="button" aria-label="Удалить область" onPointerDown={e=>e.stopPropagation()} onClick={()=>onDeleteArea(area.id)}>×</button></span>}</div>
    <div style={{position:'relative',height:'calc(100% - 44px)'}}>
      {controls.map(original=>{
        const control=moving?.id===original.id?moving:original
        const directionKind = isDirectionControl(control.kind) ? control.kind : null
        const isDisplay = control.kind === 'display'
        const isDistanceGauge = control.kind === 'distance-gauge'
        const gaugePort = control.port || 'C'
        const gaugeError = isDistanceGauge && isLiveRobot && sensorPortsKnown && !sensorPorts.includes(gaugePort)
          ? `Подключите датчик ${gaugePort}`
          : undefined
        const isPlaceable = isPlaceableControl(control.kind)
        const nearAreaResize = isPlaceable && control.x + control.width > area.width - 34
          && control.y + control.height > area.height - 44 - 34
        const directionErrors = directionKind ? Object.fromEntries(DIRECTION_CONTROLS[directionKind].inputs.map(input => [input, errors[`${control.id}:${input}`]])) : {}
        const directionError = directionKind ? DIRECTION_CONTROLS[directionKind].inputs.map(input => errors[`${control.id}:${input}`]).find(Boolean) : undefined
        const cardError = directionError || gaugeError
        const moveByKey = (e: React.KeyboardEvent<HTMLElement>) => {
          const d = arrow(e.key)
          if (!editing || !d) return
          e.preventDefault()
          e.stopPropagation()
          const c = {...control, x: Math.max(0, Math.min(area.width - control.width, control.x + d[0])), y: Math.max(0, Math.min(area.height - 44 - control.height, control.y + d[1]))}
          if (fits(c)) onControlChange(c)
        }
        return <div key={control.id} className="group/control" role={isPlaceable ? "group" : undefined} aria-label={isPlaceable ? control.label : undefined}
          style={{position:'absolute',left:control.x,top:control.y,width:control.width,height:control.height,border:cardError?'2px solid #dc2626':'2px solid #dfae87',borderRadius:12,background:cardError?'#fef2f2':'#fff',padding:6,overflow:isPlaceable?'hidden':'auto',display:isPlaceable?'flex':undefined,flexDirection:isPlaceable?'column':undefined}}>
        {!directionKind && !isDistanceGauge && (!isPlaceable || editing) &&
        <div tabIndex={editing?0:-1} role="button" aria-label={`Переместить ${control.label}`} onKeyDown={moveByKey} onPointerDown={e=>dragControl(e,control)} style={{fontWeight:700,cursor:editing?'grab':'default',touchAction:'none',minHeight:isPlaceable?24:undefined,fontSize:isPlaceable?12:undefined}}>{rename?.id===control.id ? <input autoFocus aria-label={`Название ${control.label}`} value={rename.value} maxLength={40} onPointerDown={e=>e.stopPropagation()} onChange={e=>setRename({id:control.id,value:e.target.value})} onBlur={()=>{if(rename.value.trim())onControlChange({...control,label:rename.value.trim()});setRename(null)}} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter')e.currentTarget.blur()}}/> : control.label}{editing&&<span style={{float:'right'}}><button type="button" aria-label={`Переименовать ${control.label}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>setRename({id:control.id,value:control.label})}>✎</button>{onDeleteControl&&<button type="button" aria-label={`Удалить ${control.label}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>onDeleteControl(control.id)}>×</button>}</span>}</div>}
        {(directionKind || isDistanceGauge) && cardError && (
          <button
            type="button"
            title={cardError}
            aria-label={`Показать причину ошибки: ${cardError}`}
            aria-haspopup="dialog"
            onPointerDown={event => event.stopPropagation()}
            onClick={event => {
              event.stopPropagation()
              setSelectedError(gaugeError || [...new Set(Object.values(directionErrors).filter(Boolean))].join('\n'))
              errorDialog.current?.showModal()
            }}
            className="absolute left-1 top-1 z-20 grid size-5 place-items-center rounded-full bg-[#dc2626] text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <AlertTriangle size={12} strokeWidth={2.6} aria-hidden="true" />
          </button>
        )}
        {(directionKind || isDistanceGauge) && editing && onDeleteControl && (
          <button
            type="button"
            aria-label={`Удалить ${control.label}`}
            title="Удалить"
            onPointerDown={e=>e.stopPropagation()}
            onClick={()=>onDeleteControl(control.id)}
            className="pointer-events-none opacity-0 group-focus-within/control:pointer-events-auto group-focus-within/control:opacity-100 absolute right-1 top-1 z-20 grid size-[22px] place-items-center rounded-full border border-[#dfae87] bg-white/95 text-xs font-extrabold leading-none text-[#7c2d12] shadow-sm hover:bg-[#fee2e2] hover:text-[#991b1b]"
          >
            ×
          </button>
        )}
                {isDistanceGauge ? (
          <div
            tabIndex={editing ? 0 : -1}
            role={editing ? "button" : undefined}
            aria-label={editing ? `Переместить ${control.label}` : undefined}
            onKeyDown={moveByKey}
            onPointerDown={editing ? event => dragControl(event, control) : undefined}
            className={`relative flex min-h-0 flex-1 flex-col justify-between gap-1.5 pt-1 ${
              editing ? 'touch-none cursor-grab rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`flex items-center gap-1 ${cardError ? 'pl-6' : ''}`}>
                <Waves size={15} className="shrink-0 text-[#4f46e5]" aria-hidden="true" />
                <select
                  aria-label="Порт дальномера"
                  value={gaugePort}
                  disabled={!editing}
                  onPointerDown={e => e.stopPropagation()}
                  onChange={e => onControlChange({ ...control, port: e.target.value })}
                  className="min-h-[36px] h-[36px] rounded-lg border border-[#c7d2fe] bg-white px-2 text-xs font-black text-[#18313b] cursor-pointer disabled:cursor-default disabled:opacity-90"
                >
                  {SENSOR_PORTS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              {(() => {
                const rawDist = sensorDistances[gaugePort]
                const trialVal = typeof rawDist === 'number' ? rawDist : 50
                const shownText = editing
                  ? '-- см'
                  : isLiveRobot
                    ? rawDist === undefined
                      ? '--'
                      : rawDist === null
                        ? '>200 см'
                        : `${rawDist} см`
                    : `${trialVal} см`
                return (
                  <span className="text-lg font-black tabular-nums text-[#18313b] whitespace-nowrap">
                    {shownText}
                  </span>
                )
              })()}
            </div>

            {!editing && inputActive && !isLiveRobot ? (
              <input
                type="range"
                min={0}
                max={200}
                step={1}
                aria-label="Имитация расстояния"
                value={typeof sensorDistances[gaugePort] === 'number' ? (sensorDistances[gaugePort] as number) : 50}
                onPointerDown={e => e.stopPropagation()}
                onChange={e => onSimulateDistance?.(gaugePort, Number(e.target.value))}
                className="w-full min-h-[36px] accent-[#4f46e5] cursor-pointer"
              />
            ) : (
              (() => {
                const rawDist = sensorDistances[gaugePort]
                const activeDist = !editing && isLiveRobot && typeof rawDist === 'number' ? rawDist : null
                const pct = activeDist === null ? 0 : Math.max(4, Math.min(100, Math.round((activeDist / 200) * 100)))
                const barColor = activeDist === null
                  ? '#cbd5e1'
                  : activeDist < 15
                    ? '#dc2626'
                    : activeDist <= 45
                      ? '#eab308'
                      : '#16a34a'
                return (
                  <div className="h-3 w-full overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden="true">
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{ width: editing || activeDist === null ? '100%' : `${pct}%`, backgroundColor: barColor }}
                    />
                  </div>
                )
              })()
            )}
          </div>
        ) : isDisplay ? (
          <div className="flex min-h-0 flex-1">
            <DisplayStreamView editing={editing} />
          </div>
        ) : directionKind ? (
          <div
            tabIndex={editing ? 0 : -1}
            role={editing ? "button" : undefined}
            aria-label={editing ? `Переместить ${control.label}` : undefined}
            onKeyDown={moveByKey}
            className={`flex min-h-0 flex-1 ${editing ? 'touch-none cursor-grab rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700' : ''}`}
            onPointerDown={editing ? event => dragControl(event, control) : undefined}
          >
            <DirectionButtons kind={directionKind} width={control.width} height={control.height} editing={editing} active={inputActive}
              errors={directionErrors} onInput={(direction,event)=>onInput(control.id,direction,event)} />
          </div>
        ) : <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{CONTROL_INPUTS[control.kind].map(input=>{
          const error=errors[`${control.id}:${input}`]
          return <button key={input} type="button" disabled={editing||Boolean(error)} aria-label={`${control.label}: ${LABELS[input]||input}`} title={error} onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);onInput(control.id,input,'pressed')}} onPointerUp={e=>{e.stopPropagation();onInput(control.id,input,'released')}} onPointerCancel={onCancel} onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();onInput(control.id,input,'pressed')}}} onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();onInput(control.id,input,'released')}}} style={{minWidth:44,minHeight:44,borderRadius:8,background:error?'#fee2e2':'#ffe4c8',border:'1px solid #b75c28',fontWeight:800}}>{LABELS[input]||input}{error&&<span aria-label={`Ошибка: ${error}`}> ⚠</span>}</button>
        })}</div>}
        {editing&&<button type="button" aria-label={`Изменить размер ${control.label}`} onPointerDown={e=>resizeControl(e,control)} style={{position:'absolute',right:nearAreaResize?32:0,bottom:0,width:28,height:28,zIndex:20,touchAction:'none',cursor:'nwse-resize'}}>◢</button>}
        {!directionKind && CONTROL_INPUTS[control.kind].some(input=>errors[`${control.id}:${input}`])&&<p role="alert" style={{color:'#991b1b',fontSize:12}}>{CONTROL_INPUTS[control.kind].map(input=>errors[`${control.id}:${input}`]).find(Boolean)}</p>}
      </div>})}
    </div>
    {editing&&<button type="button" aria-label="Изменить размер области" onPointerDown={e=>dragArea(e,true)} style={{position:'absolute',right:0,bottom:0,width:32,height:32,touchAction:'none',cursor:'nwse-resize'}}>◢</button>}
    <dialog ref={errorDialog} role="dialog" aria-labelledby={errorTitleId}
      onPointerDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}
      className="fixed inset-0 m-auto w-[calc(100%_-_32px)] max-w-sm rounded-2xl border border-[#dfae87] bg-white p-5 text-[#18313b] shadow-xl backdrop:bg-black/30">
      <h2 id={errorTitleId} className="mb-3 text-lg font-extrabold">Кнопка недоступна</h2>
      <p className="whitespace-pre-line text-sm">{selectedError}</p>
      <form method="dialog" className="mt-4 flex justify-end">
        <button type="submit" className="rounded-full bg-[#0e7668] px-4 py-2 font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Понятно</button>
      </form>
    </dialog>
  </section>
}
