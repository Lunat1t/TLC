"use client"
import { useEffect, useRef, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { useWorkspaceSettings } from "./workspace-settings"
import { storeWorkspaceImage } from "@/lib/workspace-media-client"

async function prepareWallpaper(file:File){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Выберите JPG, PNG или WebP.')
 if(file.size>12_000_000)throw Error('Выберите картинку до 12 МБ.')
 const bitmap=await createImageBitmap(file)
 try{
  const canvas=document.createElement('canvas');let scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height))
  const context=canvas.getContext('2d');if(!context)throw Error('Не удалось обработать картинку.')
  for(let attempt=0;attempt<4;attempt++){
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale))
   context.fillStyle='#ecdcc1';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height)
   const image=canvas.toDataURL('image/jpeg',.8)
   if(image.length<=900_000)return image
   scale*=.75
  }
  throw Error('Картинка слишком сложная. Выберите изображение поменьше.')
 }finally{bitmap.close()}
}
export function WallpaperPicker({onBusyChange}:{onBusyChange:(busy:boolean)=>void}){
 const {userId,settings,update,ready}=useWorkspaceSettings(),input=useRef<HTMLInputElement>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const active=useRef(true),latestUpdate=useRef(update);latestUpdate.current=update
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function choose(file:File){setBusy(true);onBusyChange(true);setError('');try{const wallpaper=await storeWorkspaceImage(await prepareWallpaper(file),userId);if(active.current&&!latestUpdate.current({wallpaper,background:'wallpaper'}))setError('Не удалось применить обои. Дождитесь загрузки аккаунта.')}catch(e){if(active.current)setError(e instanceof Error?e.message:'Не удалось открыть изображение.')}finally{if(active.current){setBusy(false);onBusyChange(false);if(input.current)input.current.value=''}}}
 return <div className="wallpaper-picker"><h3>Свои обои</h3><p>Выберите картинку из галереи. Обои сохранятся в вашем аккаунте.</p>{settings.wallpaper&&<img className="wallpaper-preview" src={settings.wallpaper} alt="Предпросмотр ваших обоев" style={{objectFit:settings.wallpaperFit||'cover'}}/>}<input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void choose(file)}}/><div className="wallpaper-actions"><button type="button" disabled={!ready||busy} onClick={()=>input.current?.click()}><ImagePlus size={20}/>{busy?'Обрабатываем…':settings.wallpaper?'Заменить обои':'Добавить обои'}</button>{settings.wallpaper&&<button type="button" disabled={!ready||busy} onClick={()=>update({wallpaper:'',background:settings.background==='wallpaper'?'grid':settings.background})}><Trash2 size={18}/>Убрать</button>}</div>{settings.wallpaper&&<label>Размещение<select disabled={!ready||busy} value={settings.wallpaperFit||'cover'} onChange={e=>update({wallpaperFit:e.target.value as 'cover'|'contain'})}><option value="cover">Заполнить экран</option><option value="contain">Картинка целиком</option></select></label>}<small>JPG, PNG или WebP до 12 МБ. Изображение уменьшается для быстрой загрузки.</small>{error&&<p role="alert" className="wallpaper-error">{error}</p>}</div>
}
