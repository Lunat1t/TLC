"use client"

import "./student-card.css"
import { StreakFlame } from "@/components/profile/streak-flame"

import { useRef, useState } from "react"
import { Camera, ChevronDown, Puzzle, Lightbulb, Pencil, Check, Sprout, Leaf, Wrench, Cog, Rocket, Star, Crown } from "lucide-react"
import { useAccess, type SessionProfile } from "@/components/auth/access-provider"
import { useWorkspaceSettings } from "@/components/lab/workspace-settings"
import { counted, useStudyWeek } from "@/components/lab/work-study-widgets"
import AvatarDarwinV3 from "@/components/profile/avatar-darwin-v3"
import Link from "next/link"
import { mapKits, tokenSkills } from "@/lib/map-kits"
import { useSkillPoints } from "@/lib/use-skill-points"
import { rankNames } from "@/lib/student-level"
import { createClient } from "@/utils/supabase/client"

const tokenBadges = {
  mechanics: { icon: Wrench, color: "#275dae", bg: "#dfeaff" },
  logic: { icon: Puzzle, color: "#ab3944", bg: "#fce3e5" },
  creativity: { icon: Lightbulb, color: "#397337", bg: "#e5f2ce" },
}

const badges = [
  { icon: Sprout, color: "#397337", bg: "#e5f2ce" },
  { icon: Leaf, color: "#007264", bg: "#cef3e9" },
  { icon: Wrench, color: "#275dae", bg: "#dfeaff" },
  { icon: Cog, color: "#7044a9", bg: "#ece3fc" },
  { icon: Rocket, color: "#ac4721", bg: "#ffe6d4" },
  { icon: Star, color: "#ad3062", bg: "#ffe2ed" },
  { icon: Crown, color: "#805508", bg: "#ffe69b" },
]

function Badge({ index }: { index: number }) {
  const { icon: Icon, color, bg } = badges[index]
  return <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl" style={{ color, background: bg }}><Icon size={24} strokeWidth={2.6} aria-hidden="true" /></span>
}

async function thumbnail(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const side = Math.min(image.naturalWidth, image.naturalHeight)
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 256
    const ctx = canvas.getContext("2d")
    if (!ctx || !side) throw Error()
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, 256, 256)
    ctx.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 256, 256)
    return canvas.toDataURL("image/jpeg", 0.82)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function StudentCard({ profile }: { profile: SessionProfile }) {
  const { settings, update, ready, error } = useWorkspaceSettings()
  const { refreshProfile } = useAccess()
  const { activeWeek, failed, reload } = useStudyWeek(true)
  const { kit, setKit, balances, amounts, total, pointsScale, rank, target } = useSkillPoints(profile.id)
  const [editing, setEditing] = useState(false)
  const [age, setAge] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const road = useRef<HTMLDialogElement>(null)
  const picker = useRef<HTMLInputElement>(null)

  async function changePhoto(file?: File) {
    if (!file) return
    setBusy(true)
    setMessage("")
    try {
      const photo = await thumbnail(file)
      if (!update({ profilePhoto: photo })) throw Error()
    } catch {
      setMessage("Не удалось загрузить фото. Попробуй выбрать другое изображение.")
    } finally { setBusy(false) }
  }

  async function saveAge() {
    setBusy(true)
    setMessage("")
    try {
      const result = await createClient().from("profiles").update({ age: Number(age) }).eq("id", profile.id).select("age").single()
      if (result.error) throw result.error
      await refreshProfile()
      setEditing(false)
    } catch { setMessage("Не удалось сохранить возраст. Попробуй ещё раз.") }
    finally { setBusy(false) }
  }

  return <div className="grid gap-4 text-[#393327]">
    <section className="student-card relative mt-3 rounded-[2rem] bg-white px-5 pb-6 pt-8 shadow-sm sm:px-8">
      <span aria-hidden="true" className="absolute -top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-md bg-[#af8860]" />
      <div className="student-identity flex items-center gap-2 sm:gap-6">
        <button type="button" className="student-photo relative grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-[#f7efd8] sm:h-32 sm:w-32" onClick={() => picker.current?.click()} disabled={!ready || busy} aria-label="Изменить фотографию профиля">
          {settings.profilePhoto ? <img src={settings.profilePhoto} alt="" className="h-full w-full rounded-3xl object-cover" /> : <AvatarDarwinV3 className="h-20 w-20 sm:h-28 sm:w-28" bodyColor={profile.avatar?.bodyColor} eyeColor={profile.avatar?.characterEyeColor} />}
          <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-white bg-[#646b44] p-2 text-white"><Camera size={15} /></span>
        </button>
        <input ref={picker} type="file" accept="image/*" hidden onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; void changePhoto(file) }} />
        <div className="min-w-0">
          <span className="text-sm font-bold text-[#706754]">Карточка ученика</span>
          <h1 className="break-words text-3xl font-black tracking-tight sm:text-4xl">{profile.nickname}</h1>
          {editing ? <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void saveAge() }}>
            <input aria-label="Возраст в годах" type="number" min="1" max="120" required autoFocus value={age} onChange={e => setAge(e.target.value)} className="w-16 rounded-lg border px-2 py-1" />
            <button disabled={busy} aria-label="Сохранить возраст"><Check size={20} /></button>
            <button type="button" onClick={() => setEditing(false)}>Отмена</button>
          </form> : <button className="mt-2 inline-flex items-center gap-2 text-sm" onClick={() => { setAge(String(profile.age ?? "")); setEditing(true) }}>{profile.age ? counted(profile.age, "год", "года", "лет") : "Указать возраст"}<Pencil size={14} /></button>}
        </div>
        {activeWeek && <span className="student-streak ml-auto inline-flex shrink-0 items-center self-start text-lg font-bold tabular-nums">
          <StreakFlame size={40} />
          <span aria-hidden="true">{activeWeek.streak}</span>
          <span className="sr-only">{counted(activeWeek.streak, "день", "дня", "дней")} подряд</span>
        </span>}
      </div>
      {(message || error) && <p role="alert" className="mt-3 text-sm text-red-800">{message || error}</p>}
      <div className="student-progress mt-6 border-t border-[#e9e2d4] pt-4">
        <div className="kit-picker mb-4 flex flex-wrap gap-2" role="group" aria-label="Ранг по набору">
          {mapKits.map(item => <button key={item.id} aria-pressed={kit === item} onClick={() => setKit(item)} className="rounded-xl bg-stone-100 px-3 py-2 font-semibold aria-pressed:bg-cyan-800 aria-pressed:text-white">{item.label}</button>)}
        </div>
        {balances ? <>
        <div>
          <button type="button" aria-haspopup="dialog" onClick={() => road.current?.showModal()} className="flex w-full text-left cursor-pointer list-none items-center gap-3 rounded-xl py-1">
            <Badge index={rank} /><span className="grid"><small>Ранг<span className="rank-kit"> · {kit.label}</span></small><strong className="text-xl">{rankNames[rank]}</strong></span>
            <span className="ml-auto flex items-center gap-1 text-right text-sm font-bold">Все ранги <ChevronDown size={16} /></span>
          </button>
          <dialog className="rank-dialog" ref={road} aria-label="Дорога рангов"><header><strong>Дорога рангов</strong><form method="dialog"><button aria-label="Закрыть дорогу рангов">Закрыть</button></form></header>
          <ol className="my-3 grid gap-1 rounded-2xl bg-[#faf7ef] p-3">
            {rankNames.map((name, i) => <li key={name} aria-current={i === rank ? "step" : undefined} className="flex items-center gap-3 rounded-xl px-2 py-1.5 aria-[current=step]:bg-white">
              <Badge index={i} /><strong>{name}</strong><span className="ml-auto text-right text-xs">{i === rank ? "Ты здесь · " : ""}{i === 0 ? "Старт" : i === 1 ? counted(target, "очко", "очка", "очков") : ""}</span>
            </li>)}
          </ol>
        </dialog>
        </div>
        <div className="mt-4 flex justify-between"><strong>Очки</strong><span>{total}{rank === 0 && ` / ${target}`}</span></div>
        <div className="mb-4 mt-2 flex h-2.5 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
          {tokenSkills.map((skill, i) => <span key={skill.id} style={{ background: skill.color, width: (100 * amounts[i] / pointsScale) + "%" }} />)}
        </div>
        <ul className="skill-list mb-4 grid gap-3">
          {tokenSkills.map((skill, i) => {
            const { icon: Icon, color, bg } = tokenBadges[skill.id]
            return <li key={skill.id} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ color, background: bg }}>
                <Icon size={25} strokeWidth={2.6} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold">
                  <span>{skill.label}</span><span className="tabular-nums">{amounts[i]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ background: skill.color, width: (100 * amounts[i] / pointsScale) + "%" }} />
                </div>
              </div>
            </li>
          })}
        </ul>
        {rank === 0 && <small>До Junior+ ещё {counted(target - total, "очко", "очка", "очков")}</small>}
        </> : <p role="status">Загружаем очки…</p>}
        <Link href={"/map?kit=" + kit.id} className="mt-4 block font-bold text-cyan-800">На карту<span className="rank-kit"> {kit.label}</span> →</Link>
      </div>
      {failed && <button onClick={reload}>Обновить серию занятий</button>}
    </section>

  </div>
}
