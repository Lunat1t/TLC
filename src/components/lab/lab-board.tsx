"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, ImagePlus, Plus, X, Pin, FolderOpen, BookOpen, Globe, UserRound, FileCode2 } from "lucide-react"
import { useAccess } from "@/components/auth/access-provider"
import "./lab-board.css"
import "./desktop.css"
import { DesktopCanvas, DesktopItem } from "./desktop-canvas"
import { useAccountWorkspace } from "./account-workspace"
import { useWorkspaceSettings } from "./workspace-settings"
import { DesktopContextMenu } from "./desktop-context-menu"
import type { RobotProject } from "@/lib/projects"

type PinItem = { id: string; kind: "note" | "image" | "event" | "shortcut"; url?: string; text: string; image?: string; date?: string; color: string }
const colors = ["yellow", "blue", "pink"] as const
const LIMIT = 18
function Clock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer) }, [])
  return <div className="lab-clock"><span>Сейчас самое время создавать</span><time dateTime={now?.toISOString()}>{now ? now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "--:--"}</time><p>{now ? now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }) : "Моя лаборатория"}</p></div>
}
function safeUrl(value: string): string | null {
  try { if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return null; const url=new URL(value,"https://tlc.local"); if (!["http:","https:"].includes(url.protocol) || url.username || url.password) return null; return url.origin==="https://tlc.local" ? url.pathname+url.search+url.hash : url.href } catch { return null }
}
type BoardProps = { projects?: RobotProject[]; onProjects?: () => void; onNewProject?: () => void; onProjectMenu?: (id: string) => void; onDeleteProject?: (id: string) => void }
function validItem(value: unknown): value is PinItem {
  if (!value || typeof value !== "object") return false
  const p = value as PinItem
  return typeof p.id === "string" && ["note", "image", "event", "shortcut"].includes(p.kind) && (p.kind !== "shortcut" || (typeof p.url === "string" && safeUrl(p.url) !== null)) && typeof p.text === "string" && p.text.length <= 300 && colors.includes(p.color as typeof colors[number]) && (p.image === undefined || (typeof p.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(p.image))) && (p.date === undefined || (typeof p.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.date)))
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
export function PersonalBoard({ userId, projects = [], onProjects, onNewProject, onProjectMenu, onDeleteProject }: { userId: string } & BoardProps) {
  const {settings}=useWorkspaceSettings()
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
  function open(type: PinItem["kind"] = "note") { setEditing(null); setText(""); setUrl(""); setDate(""); setFile(null); setKind(type); setDialog(true) }
  async function add(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("")
    try {
      if (kind !== "image" && !text.trim()) throw Error("Напишите текст карточки.")
      if (kind === "event" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(new Date(`${date}T12:00:00`).getTime()))) throw Error("Укажите дату события.")
      if (kind === "image" && !file) throw Error("Выберите картинку.")
      if (!editing && items.length >= LIMIT) throw Error("На доске помещается до 18 материалов.")
      if (kind === "shortcut" && !safeUrl(url.trim())) throw Error("Укажите адрес сайта с https:// или путь страницы TLC, например /instructions.")
      const item: PinItem = { id: editing || crypto.randomUUID(), kind, text: text.trim(), color, ...(kind === "shortcut" ? {url:safeUrl(url.trim())!} : {}), ...(kind === "event" ? { date } : {}), ...(kind === "image" && file ? { image: await imageData(file) } : {}) }
      if (save(editing?items.map(p=>p.id===editing?item:p):[...items, item])) setDialog(false)
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось добавить материал.") } finally { setBusy(false) }
  }
  return <>
  <DesktopContextMenu canPin={loaded && items.length<LIMIT} onShortcut={()=>open("shortcut")} onNote={()=>open("note")} onProject={onNewProject}><DesktopCanvas userId={userId}>
    {settings.clock!=="hidden"&&<DesktopItem id="clock" label="Часы" initial={[.48,.03]} movable={false} className={`desktop-clock clock-${settings.clock}`}><Clock/></DesktopItem>}
    <DesktopItem id="projects" label="Проекты" initial={[.03,.66]} className="desktop-shortcut"><button className="desktop-launch" onClick={onProjects}><span className="desktop-app-icon is-yellow"><FolderOpen/></span><strong>Мои проекты</strong></button></DesktopItem>
    <DesktopItem id="instructions" label="Инструкции" initial={[.19,.66]} className="desktop-shortcut"><Link className="desktop-launch" href="/instructions"><span className="desktop-app-icon is-blue"><BookOpen/></span><strong>Инструкции</strong></Link></DesktopItem>
    <DesktopItem id="profile" label="Профиль" initial={[.35,.66]} className="desktop-shortcut"><Link className="desktop-launch" href="/profile"><span className="desktop-app-icon is-red"><UserRound/></span><strong>Профиль</strong></Link></DesktopItem>
    {projects.map((project,index)=><DesktopItem key={project.id} id={`project:${project.id}`} label={project.name} onEdit={()=>onProjectMenu?.(project.id)} onDelete={()=>onDeleteProject?.(project.id)} initial={[.5+(index%3)*.17, .48+index/(projects.length+1)*.46]} mobileInitial={[(index%3)*.5,.36+Math.floor(index/3)/(Math.ceil(projects.length/3)+1)*.2]} className="desktop-shortcut"><Link className="desktop-launch" href={`/editor?id=${encodeURIComponent(project.id)}`}><span className="desktop-app-icon is-project"><FileCode2/></span><strong>{project.name}</strong></Link><button className="desktop-project-menu" onClick={()=>onProjectMenu?.(project.id)} aria-label={`Действия с проектом ${project.name}`}>•••</button></DesktopItem>)}
    {items.map((item,index)=><DesktopItem id={`pin:${item.id}`} key={item.id} label={item.kind==="shortcut"?item.text:"Карточка"} initial={[.08+(index%4)*.22, .23+Math.floor(index/4)*.15]} mobileInitial={[(index%2)*.98,.58+index/(items.length+1)*.4]} onEdit={item.kind==="shortcut"?()=>{setEditing(item.id);setKind(item.kind);setText(item.text);setUrl(item.url||"");setColor(item.color);setDialog(true)}:undefined} onDelete={()=>{if(window.confirm(`Удалить «${item.text||"карточку"}»?`))save(items.filter(p=>p.id!==item.id))}} className={item.kind==="shortcut"?"desktop-shortcut":"desktop-note"}>
      {item.kind==="shortcut" ? <><a className="desktop-launch" href={item.url} target={item.url?.startsWith("/")?undefined:"_blank"} rel="noopener noreferrer"><span className="desktop-app-icon is-purple"><Globe/></span><strong>{item.text}</strong></a><button className="desktop-unpin" onClick={()=>save(items.filter(p=>p.id!==item.id))} aria-label={`Убрать ярлык ${item.text}`}><X size={14}/></button></> : <article className={`lab-pin lab-pin-${item.kind} lab-pin-${item.color}`}><span className="lab-pin-head" aria-hidden="true"/>{item.image?<img src={item.image} alt={item.text||"Закреплённая картинка"}/>:null}{item.kind==="event"&&item.date?<time dateTime={item.date}>{new Date(`${item.date}T12:00:00`).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"})}</time>:null}<p>{item.text}</p><button className="desktop-remove" onClick={()=>save(items.filter(p=>p.id!==item.id))} aria-label={`Открепить ${item.text||"картинку"}`}><X size={16}/></button></article>}
    </DesktopItem>)}
  </DesktopCanvas></DesktopContextMenu><div className="desktop-hint">Правый клик или долгое нажатие на пустом месте — меню · Перетаскивай элементы за полоску сверху · Сохраняется в аккаунте</div>{error&&!dialog?<p role="alert" className="lab-error">{error}</p>:null}<dialog ref={dialogRef} className="lab-dialog" aria-labelledby="lab-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else setDialog(false) }} onClose={() => setDialog(false)}><form onSubmit={add}><header><h2 id="lab-dialog-title">{editing?"Редактировать ярлык":"Что закрепим?"}</h2><button type="button" disabled={busy} onClick={() => setDialog(false)} aria-label="Закрыть"><X /></button></header><div className="lab-kinds">{([['note', 'Заметка'], ['image', 'Картинка / мем'], ['event', 'Событие'], ['shortcut', 'Ярлык']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div><label htmlFor="pin-text">{kind === "image" ? "Подпись к картинке" : kind === "shortcut" ? "Название ярлыка" : "Что хочется сохранить?"}</label><textarea id="pin-text" autoFocus maxLength={300} required={kind !== "image"} value={text} onChange={e => setText(e.target.value)} placeholder="Новая идея, смешная мысль или маленькая победа…" />{kind === "shortcut" ? <label>Адрес сайта или страницы TLC<input type="text" required value={url} maxLength={2000} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com или /instructions" /></label> : null}{kind === "image" ? <label className="lab-file"><ImagePlus size={20} /> {file?.name || "Выбрать картинку"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} /></label> : null}{kind === "event" ? <label>Дата события<input type="date" min="0001-01-01" max="9999-12-31" required value={date} onChange={e => setDate(e.target.value)} /></label> : null}<fieldset><legend>Цвет карточки</legend>{colors.map(value => <button type="button" key={value} className={`lab-swatch lab-pin-${value}`} aria-label={{yellow:'Жёлтый',blue:'Голубой',pink:'Розовый'}[value]} aria-pressed={color === value} onClick={() => setColor(value)} />)}</fieldset>{error ? <p role="alert" className="lab-error">{error}</p> : null}<button className="lab-submit" disabled={busy} type="submit">{busy ? "Сохраняем…" : "Закрепить на доске"}<Pin size={18} /></button></form></dialog></>
}
