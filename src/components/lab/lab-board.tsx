"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, ImagePlus, Plus, X, Pin, FolderOpen, BookOpen, Globe, UserRound, FileCode2 } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import "./lab-board.css"
import "./desktop.css"
import { DesktopCanvas, DesktopItem } from "./desktop-canvas"
import { useAccountWorkspace } from "./account-workspace"
import { WorkStudyWidgets } from "./work-study-widgets"
import { DesktopContextMenu } from "./desktop-context-menu"
import type { RobotProject } from "@/lib/projects"

type PinItem = { desktop?:number; id: string; kind: "note" | "image" | "event" | "shortcut"; url?: string; text: string; image?: string; date?: string; color: string }
const colors = ["yellow", "blue", "pink"] as const
const LIMIT = 18
function safeUrl(value: string): string | null {
  try { if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return null; const url=new URL(value,"https://tlc.local"); if (!["http:","https:"].includes(url.protocol) || url.username || url.password) return null; return url.origin==="https://tlc.local" ? url.pathname+url.search+url.hash : url.href } catch { return null }
}
type BoardProps = { projects?: RobotProject[]; onProjects?: () => void; onNewProject?: () => void; onProjectMenu?: (id: string) => void; onDeleteProject?: (id: string) => void }
function validItem(value: unknown): value is PinItem {
  if (!value || typeof value !== "object") return false
  const p = value as PinItem
  return (p.desktop===undefined||(Number.isInteger(p.desktop)&&p.desktop>=0&&p.desktop<6)) && typeof p.id === "string" && ["note", "image", "event", "shortcut"].includes(p.kind) && (p.kind !== "shortcut" || (typeof p.url === "string" && safeUrl(p.url) !== null)) && typeof p.text === "string" && p.text.length <= 300 && colors.includes(p.color as typeof colors[number]) && (p.image === undefined || (typeof p.image === "string" && (/^data:image\/(jpeg|png|webp);base64,/.test(p.image)||(/^https:\/\//.test(p.image)&&safeUrl(p.image)!==null)))) && (p.date === undefined || (typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date)))
}
async function imageData(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000) throw new Error("Выберите JPG, PNG или WebP до 12 МБ.")
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Не удалось обработать картинку.")
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL("image/jpeg", .8)
  } finally { bitmap.close() }
}
export function LabBoard(props: BoardProps) {
  const { userId, ready, error, refreshProfile } = useAccess()
  return <section className="lab desktop-lab" aria-label="Моя инженерная лаборатория">{ready && userId ? <PersonalBoard key={userId} userId={userId} {...props} /> : <div className="lab-loading" role="status">{error ? <><p>Не удалось открыть рабочий стол.</p><button onClick={()=>void refreshProfile()}>Повторить</button></> : "Готовим ваше рабочее место…"}</div>}</section>
}
function InlineNote({text,focus,onSave}:{text:string;focus:boolean;onSave:(value:string)=>boolean}){
 const [draft,setDraft]=useState(text)
 const draftRef=useRef(text),savedRef=useRef(text),saveRef=useRef(onSave)
 saveRef.current=onSave
 function persist(){if(draftRef.current!==savedRef.current&&saveRef.current(draftRef.current))savedRef.current=draftRef.current}
 useEffect(()=>{const timer=setTimeout(persist,600);return()=>clearTimeout(timer)},[draft])
 useEffect(()=>{const save=()=>persist();window.addEventListener('pagehide',save);return()=>{window.removeEventListener('pagehide',save)}},[])
 return <textarea autoFocus={focus} aria-label="Текст заметки" placeholder="Напиши что-нибудь…" maxLength={300} className="inline-note" value={draft} onChange={e=>{draftRef.current=e.target.value;setDraft(e.target.value)}} onBlur={persist}/>
}
export function PersonalBoard({ userId, projects = [], onProjects, onNewProject, onProjectMenu, onDeleteProject }: { userId: string } & BoardProps) {
  const { role } = useAccess()
  const [focusNote,setFocusNote]=useState<string|null>(null)
  const [pictureOpen,setPictureOpen]=useState(false),[pictureUrl,setPictureUrl]=useState("")
  const pictureDialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{if(pictureOpen)pictureDialog.current?.showModal();else pictureDialog.current?.close()},[pictureOpen])
  const pictureRef=useRef<HTMLInputElement>(null)
  const [editing,setEditing]=useState<string|null>(null)
  const store=useAccountWorkspace()
  const [items, setItems] = useState<PinItem[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState(false)
  const [kind, setKind] = useState<PinItem["kind"]>("note")
  const [color, setColor] = useState("yellow")
  const [text, setText] = useState("")
  const [url, setUrl] = useState("")
  const [date, setDate] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(()=>{
    setLoaded(false)
    if(!store.ready)return
    const data=store.values.board||[]
    if(!Array.isArray(data)||data.length>LIMIT||!data.every(validItem)){setError('Не удалось прочитать доску аккаунта.');return}
    setItems(data);setLoaded(true)
  },[store.ready,store.values.board])
  useEffect(() => { if (dialog) dialogRef.current?.showModal(); else dialogRef.current?.close() }, [dialog])
  function save(next:PinItem[]){if(!loaded)return false;if(JSON.stringify(next).length>3_000_000){setError('Доска слишком большая. Выберите картинку поменьше.');return false}if(!store.update('board',next))return false;setItems(next);setError('');return true}
  function createNote(){const id=crypto.randomUUID();if(save([...items,{id,kind:'note',text:'',color:'yellow'}]))setFocusNote(id)}
  async function insertPicture(file?:File){setBusy(true);setError('');try{const image=file?await imageData(file):safeUrl(pictureUrl.trim());if(!image||(!file&&!image.startsWith('https://')))throw Error('Укажите HTTPS-ссылку на картинку.');if(save([...items,{id:crypto.randomUUID(),kind:'image',text:'',color:'blue',image}])){setPictureOpen(false);setPictureUrl('')}}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть картинку.')}finally{setBusy(false);if(pictureRef.current)pictureRef.current.value=''}}
  function open(type: PinItem["kind"] = "note") { setEditing(null); setText(""); setUrl(""); setDate(""); setFile(null); setKind(type); setDialog(true) }
  async function add(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      if (kind !== "image" && !text.trim()) throw Error("Напишите текст карточки.")
      if (kind === "event" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(`${date}T12:00:00`).getTime()))) throw Error("Укажите дату события.")
      if (kind === "image" && !file) throw Error("Выберите картинку.")
      if (!editing && items.length >= LIMIT) throw Error("На доске помещается до 18 материалов.")
      if (kind === "shortcut" && !safeUrl(url.trim())) throw Error("Укажите адрес сайта с https:// или путь страницы Brick Studio, например /instructions.")
      const item: PinItem = { id: editing || crypto.randomUUID(), kind, text: text.trim(), color, ...(kind === "shortcut" ? {url:safeUrl(url.trim())!} : {}), ...(kind === "event" ? { date } : {}), ...(kind === "image" && file ? { image: await imageData(file) } : {}) }
      if (save(editing?items.map(p=>p.id===editing?item:p):[...items, item])) setDialog(false)
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось добавить материал.") } finally { setBusy(false) }
  }
  return <>
  <DesktopContextMenu canPin={loaded && items.length<LIMIT} onShortcut={()=>open("shortcut")} onNote={createNote} onImage={()=>{setPictureOpen(true);setError('')}} onProject={onNewProject}>
    <WorkStudyWidgets student={role === "student"} />
    <DesktopCanvas userId={userId}>
    {projects.map((project,index)=><DesktopItem key={project.id} id={`project:${project.id}`} label={project.name} onEdit={()=>onProjectMenu?.(project.id)} onDelete={()=>onDeleteProject?.(project.id)} initial={[.5+(index%3)*.17, .48+index/(projects.length+1)*.46]} mobileInitial={[(index%3)*.5,.36+Math.floor(index/3)/(Math.ceil(projects.length/3)+1)*.2]} className="desktop-shortcut"><Link className="desktop-launch" href={`/editor?id=${encodeURIComponent(project.id)}`}><span className={`desktop-app-icon is-project is-project-${project.hub}`} title={project.hub === "ev3" ? "LEGO EV3" : "SPIKE Prime"}><FileCode2 aria-label={project.hub === "ev3" ? "Программа EV3" : "Программа SPIKE"}/></span><strong>{project.name}</strong></Link><button className="desktop-project-menu" onClick={()=>onProjectMenu?.(project.id)} aria-label={`Действия с проектом ${project.name}`}>•••</button></DesktopItem>)}
    {items.map((item,index)=><DesktopItem id={`pin:${item.id}`} key={item.id} label={item.kind==="shortcut"?item.text:"Карточка"} initial={[.08+(index%4)*.22, .23+Math.floor(index/4)*.15]} mobileInitial={[(index%2)*.98,.58+index/(items.length+1)*.4]} onEdit={item.kind==="shortcut"?()=>{setEditing(item.id);setKind(item.kind);setText(item.text);setUrl(item.url||"");setColor(item.color);setDialog(true)}:undefined} onDelete={()=>{if(window.confirm(`Удалить «${item.text||"карточку"}»?`))save(items.filter(p=>p.id!==item.id))}} className={item.kind==="shortcut"?"desktop-shortcut":"desktop-note"}>
      {item.kind==="shortcut" ? <><a className="desktop-launch" href={item.url} target={item.url?.startsWith("/")?undefined:"_blank"} rel="noopener noreferrer"><span className="desktop-app-icon is-purple"><Globe/></span><strong>{item.text}</strong></a><button className="desktop-unpin" onClick={()=>save(items.filter(p=>p.id!==item.id))} aria-label={`Убрать ярлык ${item.text}`}><X size={14}/></button></> : <article className={`lab-pin lab-pin-${item.kind} lab-pin-${item.color}`}><span className="lab-pin-head" aria-hidden="true"/>{item.image?<img src={item.image} referrerPolicy="no-referrer" alt={item.text||"Закреплённая картинка"}/>:null}{item.kind==="event"&&item.date?<time dateTime={item.date}>{new Date(`${item.date}T12:00:00`).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</time>:null}{item.kind==='note'?<InlineNote text={item.text} focus={focusNote===item.id} onSave={value=>save(items.map(p=>p.id===item.id?{...p,text:value}:p))}/>:<p>{item.text}</p>}<button className="desktop-remove" onClick={()=>save(items.filter(p=>p.id!==item.id))} aria-label={`Открепить ${item.text||"картинку"}`}><X size={16}/></button></article>}
    </DesktopItem>)}
  </DesktopCanvas></DesktopContextMenu>{error&&!dialog?<p role="alert" className="lab-error">{error}</p>:null}<dialog ref={pictureDialog} onCancel={()=>setPictureOpen(false)} onClose={()=>setPictureOpen(false)} aria-label="Добавить картинку" className="picture-picker"><header><h2>Картинка</h2><button disabled={busy} onClick={()=>setPictureOpen(false)} aria-label="Закрыть">×</button></header><input ref={pictureRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e=>{const selected=e.target.files?.[0];if(selected)void insertPicture(selected)}}/><button autoFocus className="picture-gallery" disabled={busy} onClick={()=>pictureRef.current?.click()}><ImagePlus/> Из галереи</button><form onSubmit={e=>{e.preventDefault();void insertPicture()}}><label>Или ссылка на картинку<input type="url" required placeholder="https://…" value={pictureUrl} onChange={e=>setPictureUrl(e.target.value)}/></label><button disabled={busy} type="submit">Добавить</button></form>{error&&<p role="alert">{error}</p>}</dialog>
<dialog ref={dialogRef} className="lab-dialog" aria-labelledby="lab-dialog-title" onCancel={()=>setDialog(false)} onClose={()=>setDialog(false)}><form onSubmit={add}><header><h2 id="lab-dialog-title">{editing?'Изменить ярлык':'Новый ярлык'}</h2><button type="button" onClick={()=>setDialog(false)} aria-label="Закрыть">×</button></header><label>Название<input required maxLength={64} value={text} onChange={e=>setText(e.target.value)}/></label><label>Адрес<input type="text" required value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com или /instructions"/></label>{error&&<p role="alert">{error}</p>}<button className="lab-submit" disabled={busy}>Сохранить</button></form></dialog></>
}
