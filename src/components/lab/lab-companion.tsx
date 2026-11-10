"use client"

import { useEffect, useId, useRef, useState, type CSSProperties } from "react"
import Link from "next/link"
import { Coffee, Footprints, Hand, Settings2, X } from "lucide-react"
import { DARWIN_V3_BODY_PATH } from "@/components/profile/avatar-darwin-v3"
import { CompanionBrain, BUDDY_W, type BuddyMode, type Platform } from "./companion-brain"
import "./lab-companion.css"
import { bodyPose, easePoseValue } from "./body-pose"

const labels:Record<BuddyMode,string>={idle:'осматривается',walk:'гуляет',climb:'карабкается',jump:'прыгает',fall:'спускается',sit:'отдыхает',sleep:'дремлет',wave:'радуется',held:'у тебя в руках',inspect:'изучает находку'}
function BuddyArt({body,eyes}:{body:string;eyes:string}) {
  const id=useId().replace(/:/g,'')
  const part=(name:string,clip:React.ReactNode)=><clipPath id={`${id}-${name}`}>{clip}</clipPath>
  return <svg viewBox="0 0 689 1080" className="buddy-art" aria-hidden="true"><defs>
    <filter id={`${id}-ink`} x="-400" y="-400" width="1500" height="2000" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB"><feMorphology in="SourceAlpha" operator="dilate" radius="10" result="expanded"/><feFlood floodColor="#1a293e"/><feComposite in2="expanded" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    {part('torso',<><rect x="50" y="70" width="590" height="320"/><rect x="171" y="350" width="347" height="228"/></>)}
  </defs><g filter={`url(#${id}-ink)`}><g className="buddy-walk-rig" fill={body}>
    <path className="buddy-walk-leg-r" fill="none" stroke={body} strokeWidth="105" strokeLinecap="round"/>
    <g className="buddy-walk-foot-r"><path d="M -42 -12 Q -42 -40 -10 -40 L 42 -40 Q 99 -40 99 17 Q 99 74 42 74 L -42 74 Q -70 74 -70 42 L -70 20 Q -70 -12 -42 -12 Z"/></g>
    <path className="buddy-walk-leg-l" fill="none" stroke={body} strokeWidth="105" strokeLinecap="round"/>
    <g className="buddy-walk-foot-l"><path d="M -42 -12 Q -42 -40 -10 -40 L 42 -40 Q 99 -40 99 17 Q 99 74 42 74 L -42 74 Q -70 74 -70 42 L -70 20 Q -70 -12 -42 -12 Z"/></g>
  </g><g className="buddy-torso"><path d={DARWIN_V3_BODY_PATH} clipPath={`url(#${id}-torso)`} fill={body}/><g className="buddy-face"><g className="buddy-blink"><rect x="235" y="172" width="65" height="156" rx="32.5" fill={eyes}/><rect x="389" y="172" width="65" height="156" rx="32.5" fill={eyes}/></g><ellipse className="buddy-mouth-open" cx="345" cy="371" rx="27" ry="36" fill="#1a293e" opacity="0"/><g className="buddy-brows" fill="none" stroke="#1a293e" strokeWidth="13" strokeLinecap="round" opacity="0"><path d="M 235 140 Q 268 122 300 140"/><path d="M 389 140 Q 422 122 454 140"/></g><path className="buddy-mouth" d="M 310 365 Q 345 378 380 365" fill="none" stroke="#1a293e" strokeWidth="13" strokeLinecap="round"/></g></g><g className="buddy-limb buddy-arm-l"><rect x="55" y="312" width="116" height="356" rx="58" fill={body}/></g><g className="buddy-limb buddy-arm-r"><rect x="518" y="312" width="116" height="356" rx="58" fill={body}/></g></g></svg>
}
export function LabCompanion({userId,bodyColor='#43c5e4',eyeColor='#fff'}:{userId:string;bodyColor?:string;eyeColor?:string}) {
  const root=useRef<HTMLDivElement>(null), pet=useRef<HTMLButtonElement>(null), bubble=useRef<HTMLDivElement>(null)
  const brain=useRef<CompanionBrain | null>(null)
  const [mode,setMode]=useState<BuddyMode>('idle'), [name,setName]=useState('Луми'),[quiet,setQuiet]=useState(false),[settings,setSettings]=useState(false),[storageError,setStorageError]=useState('')
  const quietRef=useRef(false), reduced=useRef(false), settingsRef=useRef(false)
  const held=useRef<{id:number;x:number;y:number;offsetX:number;offsetY:number;moved:boolean}|null>(null)
  const memory=useRef({visits:0,greetings:0})
  const memoryKey=`tlc-companion-v1:${userId}`
  function persist(nextName=name,nextQuiet=quiet) {
    try {localStorage.setItem(memoryKey,JSON.stringify({...memory.current,name:nextName,quiet:nextQuiet}));setStorageError('')}catch{setStorageError('Не удалось сохранить настройки напарника в браузере.')}
  }
  useEffect(()=>{
    try {const raw=localStorage.getItem(memoryKey);if(raw){const saved=JSON.parse(raw);if(typeof saved.name==='string'&&saved.name.trim())setName(saved.name.slice(0,24));setQuiet(saved.quiet===true);quietRef.current=saved.quiet===true;memory.current={visits:Number.isFinite(saved.visits)?saved.visits:0,greetings:Number.isFinite(saved.greetings)?saved.greetings:0}}memory.current.visits++}catch{setStorageError('Не удалось прочитать память напарника. Настройки можно задать заново.')}
  },[memoryKey])
  useEffect(()=>{
    const container=root.current?.parentElement;if(!container)return
    const b=new CompanionBrain(container.clientWidth,container.clientHeight);brain.current=b
    const preference=matchMedia('(prefers-reduced-motion: reduce)')
    const changePreference=()=>{reduced.current=preference.matches};changePreference();preference.addEventListener('change',changePreference)
    let frame=0,last=0,geometryAt=0,lastMode=b.mode,alive=true
    let walked=0, previousX=b.x, motionTime=0
    const element=pet.current
    const rig={left:element?.querySelector('.buddy-walk-leg-l'),right:element?.querySelector('.buddy-walk-leg-r'),leftFoot:element?.querySelector('.buddy-walk-foot-l'),rightFoot:element?.querySelector('.buddy-walk-foot-r'),torso:element?.querySelector('.buddy-torso'),armLeft:element?.querySelector('.buddy-arm-l'),armRight:element?.querySelector('.buddy-arm-r'),shadow:element?.querySelector<HTMLElement>('.buddy-ground-shadow'),face:element?.querySelector('.buddy-face'),eyes:element?.querySelector('.buddy-blink'),mouth:element?.querySelector('.buddy-mouth'),openMouth:element?.querySelector('.buddy-mouth-open'),brows:element?.querySelector('.buddy-brows')}
    let surfaces: Set<string> | null = null
    function geometry(){
      const rect=container!.getBoundingClientRect()
      const platforms:Platform[]=Array.from(container!.querySelectorAll<HTMLElement>('.desktop-app-icon, .lab-pin')).map((el,index)=>{
        const r=el.getBoundingClientRect(),item=el.closest<HTMLElement>('[data-desktop-id]')
        return {id:item?.dataset.desktopId||`surface-${index}`,x:r.left-rect.left,y:r.top-rect.top,width:r.width,label:item?.dataset.desktopLabel||'Новая идея'}
      })
      b.setWorld(container!.clientWidth,container!.clientHeight,platforms)
      const added=surfaces ? platforms.find(p=>!surfaces!.has(p.id)) : undefined
      surfaces=new Set(platforms.map(p=>p.id))
      if(added&&!quietRef.current&&!reduced.current)b.notice(added.id)
    }
    geometry()
    function render(dt:number){
      const ease=reduced.current?1:1-Math.exp(-dt*22)
      const apply=(node:Element|null|undefined,attribute:string,value:string)=>{if(node)node.setAttribute(attribute,easePoseValue(node.getAttribute(attribute)||undefined,value,ease))}
      const walking=b.mode==='walk'&&!reduced.current
      if(walking)walked+=Math.abs(b.x-previousX)
      else walked=0
      const pose=bodyPose(b.mode,reduced.current?0:motionTime,reduced.current?10:b.age,walked,b.direction,b.perched,b.jumpProgress)
      apply(rig.left,'d',pose.left.path);apply(rig.right,'d',pose.right.path)
      apply(rig.leftFoot,'transform',pose.left.foot);apply(rig.rightFoot,'transform',pose.right.foot)
      apply(rig.torso,'transform',pose.torso);apply(rig.armLeft,'transform',pose.armLeft);apply(rig.armRight,'transform',pose.armRight)
      apply(rig.face,'transform',pose.face);apply(rig.mouth,'d',pose.mouth)
      apply(rig.mouth,'opacity',pose.expression==='surprised'?'0':'1');apply(rig.openMouth,'opacity',pose.expression==='surprised'?'1':'0');apply(rig.brows,'opacity',b.mode==='inspect'||pose.expression==='surprised'?'1':'0')
      if(rig.eyes instanceof SVGElement)rig.eyes.style.setProperty('--buddy-eye-y',String(pose.eyeY))
      if(rig.shadow)rig.shadow.style.transform=`scaleX(${pose.shadow})`
      previousX=b.x
      if(pet.current){pet.current.style.transform=`translate3d(${b.x}px,${b.y}px,0)`;pet.current.dataset.mode=b.mode;pet.current.dataset.perched=String(b.perched);pet.current.style.setProperty('--buddy-look',`${b.gaze}px`)}
      if(bubble.current){bubble.current.textContent=b.message;bubble.current.hidden=!b.message;bubble.current.style.left=`${Math.max(100,Math.min(container!.clientWidth-100,b.x+BUDDY_W/2))}px`;bubble.current.style.top=`${Math.max(0,b.y-48)}px`}
      if(lastMode!==b.mode){lastMode=b.mode;setMode(b.mode)}
    }
    function tick(time:number){
      if(!alive)return
      const dt=last?Math.min(.04,(time-last)/1000):0;last=time
      const blocked=settingsRef.current || !!document.querySelector('dialog[open], .desktop-project-window, .home-shell > .fixed')
      if(time-geometryAt>350){geometry();geometryAt=time}
      if(!blocked){motionTime+=dt;b.tick(dt,quietRef.current||reduced.current)}
      render(dt);frame=requestAnimationFrame(tick)
    }
    function visibility(){cancelAnimationFrame(frame);last=0;if(!document.hidden)frame=requestAnimationFrame(tick)}
    document.addEventListener('visibilitychange',visibility)
    if(!document.hidden)frame=requestAnimationFrame(tick)
    return ()=>{alive=false;cancelAnimationFrame(frame);brain.current=null;document.removeEventListener('visibilitychange',visibility);preference.removeEventListener('change',changePreference)}
  },[])
  function react(){brain.current?.interact('pet');memory.current.greetings++;persist()}
  function control(action:'call'|'rest'|'explore'|'hop') {const calm=action==='rest';setQuiet(calm);quietRef.current=calm;persist(name,calm);brain.current?.interact(action)}
  function toggleSettings(value:boolean){settingsRef.current=value;setSettings(value)}
  return <div className="lab-companion-layer" ref={root}>
    <div className="buddy-controls"><button className="buddy-status" onClick={()=>toggleSettings(!settings)} aria-expanded={settings} aria-controls="buddy-settings"><span className="buddy-status-dot"/>{name}<small>{labels[mode]}</small><Settings2 size={14}/></button><button onClick={()=>control('call')} aria-label={`Позвать ${name}`} title="Позвать"><Hand size={16}/></button><button onClick={()=>control(quiet?'explore':'rest')} aria-label={quiet?'Отправить гулять':'Спокойный режим'} aria-pressed={quiet} title={quiet?'Отправить гулять':'Спокойный режим'}>{quiet?<Footprints size={16}/>:<Coffee size={16}/>}</button></div>
    {settings&&<section id="buddy-settings" className="buddy-settings" onKeyDown={e=>{if(e.key==='Escape')toggleSettings(false)}} aria-label="Мой напарник"><header><strong>Твой напарник</strong><button onClick={()=>toggleSettings(false)} aria-label="Закрыть настройки напарника"><X size={17}/></button></header><label>Как его зовут?<input value={name} maxLength={24} onChange={e=>setName(e.target.value)} onBlur={()=>{const value=name.trim()||'Луми';setName(value);persist(value)}}/></label><p>Можно погладить, взять и перенести. Он сам исследует лабораторию и отдыхает на карточках.</p><button onClick={()=>{control('explore');toggleSettings(false)}}><Footprints size={16}/> Исследовать доску</button><button onClick={()=>{control('hop');toggleSettings(false)}}>Прыгнуть</button><Link href="/avatar">Изменить внешность</Link><small>Поведение работает на устройстве. {memory.current.greetings>0?`Приветствий: ${memory.current.greetings}.`:''}</small></section>}
    <button ref={pet} type="button" className="lab-buddy" data-mode={mode} aria-label={`${name}, напарник. Погладить или перетащить`} style={{'--buddy-body':bodyColor} as CSSProperties} onClick={e=>{if(e.detail===0)react()}} onKeyDown={e=>{if(e.key==='Escape'){held.current=null;brain.current?.release()}}} onPointerDown={e=>{
      if(e.button!==0||!brain.current)return;e.preventDefault();const b=brain.current;const rect=root.current!.getBoundingClientRect();held.current={id:e.pointerId,x:e.clientX,y:e.clientY,offsetX:e.clientX-rect.left-b.x,offsetY:e.clientY-rect.top-b.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId)
    }} onPointerMove={e=>{const h=held.current,b=brain.current;if(!h||!b||e.pointerId!==h.id)return;if(!h.moved&&Math.hypot(e.clientX-h.x,e.clientY-h.y)>5){h.moved=true;b.grab()}if(h.moved){const r=root.current!.getBoundingClientRect();b.drag(e.clientX-r.left-h.offsetX,e.clientY-r.top-h.offsetY)}}} onPointerUp={e=>{const h=held.current;if(!h||h.id!==e.pointerId)return;held.current=null;if(h.moved)brain.current?.release();else react();e.currentTarget.releasePointerCapture(e.pointerId)}} onPointerCancel={()=>{held.current=null;brain.current?.release()}}>
      <span className="buddy-ground-shadow"/><BuddyArt body={bodyColor} eyes={eyeColor}/><span className="buddy-sleep" aria-hidden="true">z z z</span><span className="buddy-heart" aria-hidden="true">♥</span>
    </button><div ref={bubble} className="buddy-speech" hidden/>{storageError&&<p className="buddy-storage-error" role="status">{storageError}</p>}
  </div>
}
