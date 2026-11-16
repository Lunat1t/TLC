"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Check, Eye, Shirt } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import type { AvatarState } from "@/lib/auth"
import { CHARACTER_CATALOG, CHARACTER_COLORS, CHARACTER_IDS, normalizeCharacterLook, type CharacterId, type CharacterLook } from "@/lib/characters"
import { useAccess } from "@/components/auth/access-provider"
import { ShapeCharacter } from "./shape-character"
import { MixMatchAccessoryArt } from "./mix-match-accessory-art"
import "./avatar-editor.css"

type Part = "body" | "eyes" | "wardrobe"

export function AvatarEditor({ initialAvatar }: { initialAvatar: Partial<AvatarState> | null }) {
  const { updateProfile, userId, role } = useAccess()
  const studentId = role === "student" ? userId : null
  const [selected, setSelected] = useState<CharacterId>("cloud")
  const [looks, setLooks] = useState<Record<CharacterId, CharacterLook>>(() => Object.fromEntries(
    CHARACTER_IDS.map(id => [id, normalizeCharacterLook(id, initialAvatar?.characters?.[id], initialAvatar)]),
  ) as Record<CharacterId, CharacterLook>)
  const [part, setPart] = useState<Part>("body")
  const [accessoryUnlocked, setAccessoryUnlocked] = useState(false)
  const [accessoryEquipped, setAccessoryEquipped] = useState(false)
  const [message, setMessage] = useState("")
  const [accessoryBusy, setAccessoryBusy] = useState(false)
  const [accessoryNotice, setAccessoryNotice] = useState<{ text: string; error?: boolean } | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveVersionRef = useRef(0)
  const currentLook = looks[selected]
  const selectedCharacter = CHARACTER_CATALOG.find(item => item.id === selected)!

  useEffect(() => {
    if (!studentId) return
    const controller = new AbortController()
    void createClient().rpc("get_my_mix_match_wardrobe").abortSignal(controller.signal).then(({ data, error }) => {
      if (controller.signal.aborted || error || !data) return
      const status = data as { accessory_unlocked?: boolean; accessory_equipped?: boolean }
      setAccessoryUnlocked(status.accessory_unlocked === true)
      setAccessoryEquipped(status.accessory_equipped === true)
    })
    return () => controller.abort()
  }, [studentId])

  async function toggleAccessory() {
    if (accessoryBusy) return
    setAccessoryBusy(true)
    setAccessoryNotice(null)
    try {
      const nextEquipped = !accessoryEquipped
      const { error } = await createClient().rpc("set_my_mix_match_accessory", { p_equipped: nextEquipped })
      if (error) throw error
      setAccessoryEquipped(nextEquipped)
      setAccessoryNotice({ text: nextEquipped ? "Смеситель Mix and Match активирован." : "Смеситель Mix and Match отключён." })
    } catch {
      setAccessoryNotice({ text: "Не удалось обновить награду. Попробуй ещё раз.", error: true })
    } finally {
      setAccessoryBusy(false)
    }
  }

  async function persistLooks(nextLooks: Record<CharacterId, CharacterLook>, version: number) {
    try {
      const client = createClient()
      const { data: { user }, error: userError } = await client.auth.getUser()
      if (userError || !user) throw new Error("Войдите в аккаунт, чтобы сохранить персонажа.")
      const { data: profile, error: readError } = await client.from("profiles").select("avatar").eq("id", user.id).single()
      if (readError) throw readError
      const nextAvatar = { ...(profile.avatar || {}), characters: { ...(profile.avatar?.characters || {}), ...nextLooks } }
      const { error: saveError } = await client.from("profiles").update({ avatar: nextAvatar, updated_at: new Date().toISOString() }).eq("id", user.id)
      if (saveError) throw saveError
      updateProfile({ avatar: nextAvatar })
      const { error: metadataError } = await client.auth.updateUser({ data: { avatar: nextAvatar } })
      if (metadataError) throw metadataError
      if (version === saveVersionRef.current) setMessage("Персонаж сохранён")
    } catch (error) {
      if (version === saveVersionRef.current) setMessage(error instanceof Error ? error.message : "Не удалось сохранить персонажа.")
    }
  }

  function scheduleSave(nextLooks: Record<CharacterId, CharacterLook>) {
    const version = ++saveVersionRef.current
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setMessage("Сохраняем…")
    saveTimerRef.current = setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.catch(() => {}).then(() => persistLooks(nextLooks, version))
    }, 250)
  }

  function changeColor(key: keyof CharacterLook, color: string) {
    const next = { ...looks, [selected]: { ...currentLook, [key]: color } }
    setLooks(next)
    scheduleSave(next)
  }

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  return <section className="avatar-editor character-editor" aria-labelledby="avatar-editor-title">
    <div className="character-editor-layout">
      <header className="character-editor-heading"><h1 id="avatar-editor-title">Персонажи</h1><p>У каждого свой характер и настроение.</p></header>
      <div className="character-editor-content">
        <nav className="character-roster" aria-label="Выбрать персонажа">
          {CHARACTER_CATALOG.map(character => <button key={character.id} type="button" className={`character-roster-item ${selected === character.id ? "active" : ""}`} aria-pressed={selected === character.id} onClick={() => { setSelected(character.id); setMessage("") }}>
            <ShapeCharacter id={character.id} bodyColor={looks[character.id].bodyColor} eyeColor={looks[character.id].eyeColor} className="character-roster-art" />
            <span>{character.label}</span>
          </button>)}
        </nav>
        <section className="character-preview" aria-label={`Предпросмотр: ${selectedCharacter.label}`}>
          <div className="character-preview-stage">
            <ShapeCharacter key={selected} id={selected} bodyColor={currentLook.bodyColor} eyeColor={currentLook.eyeColor} randomEmotions className="character-preview-art" />
            {accessoryEquipped && <svg className="character-preview-accessory" viewBox="0 0 156 125" role="img" aria-label="Награда Mix and Match активна"><MixMatchAccessoryArt /></svg>}
          </div>
          <div className="character-preview-copy"><h2>{selectedCharacter.label}</h2><p>{selectedCharacter.personality}</p></div>
        </section>
        <section className="character-controls" aria-label={`Настроить ${selectedCharacter.label}`}>
          <div className="avatar-tabs" role="group" aria-label="Параметры персонажа">
            <button type="button" aria-label="Цвет тела" title="Цвет тела" aria-pressed={part === "body"} className={part === "body" ? "active" : ""} onClick={() => setPart("body")}><span className="character-color-icon" style={{ background: currentLook.bodyColor }} /></button>
            <button type="button" aria-label="Цвет глаз" title="Цвет глаз" aria-pressed={part === "eyes"} className={part === "eyes" ? "active" : ""} onClick={() => setPart("eyes")}><Eye size={23} /></button>
            {studentId && accessoryUnlocked && <button type="button" aria-label="Награды" title="Награды" aria-pressed={part === "wardrobe"} className={part === "wardrobe" ? "active" : ""} onClick={() => setPart("wardrobe")}><Shirt size={23} /></button>}
          </div>
          {part === "wardrobe" ? <div className="avatar-accessory-control"><div className="avatar-accessory-art"><svg viewBox="0 0 156 125" role="img" aria-label="Смеситель Mix and Match"><MixMatchAccessoryArt /></svg></div><div><h3>Награда Mix and Match</h3><p>Доступна в профиле ученика</p></div><button type="button" className="avatar-accessory-toggle" onClick={() => void toggleAccessory()} disabled={accessoryBusy}>{accessoryBusy ? "Сохраняем…" : accessoryEquipped ? "Отключить" : "Включить"}</button>{accessoryNotice && <p role={accessoryNotice.error ? "alert" : "status"}>{accessoryNotice.text}</p>}</div> : <>
            <div className="avatar-color-heading"><div><h3>Цвет {part === "eyes" ? "глаз" : "персонажа"}</h3><p>{selectedCharacter.label}</p></div><span className="avatar-current-color" style={{ backgroundColor: currentLook[part === "eyes" ? "eyeColor" : "bodyColor"] }} /></div>
            <div className="avatar-palette" aria-label={`Цвет ${part === "eyes" ? "глаз" : "персонажа"}`}>
              {CHARACTER_COLORS.map(({ name, color }) => { const key = part === "eyes" ? "eyeColor" : "bodyColor"; const active = currentLook[key] === color; return <button key={color} type="button" className={`avatar-swatch ${active ? "selected" : ""} ${color === "#f2f5f7" ? "light" : ""}`} style={{ "--swatch": color } as CSSProperties} aria-label={name} aria-pressed={active} onClick={() => changeColor(key, color)}>{active && <Check size={16} />}</button> })}
            </div>
            <div className="avatar-color-label">{CHARACTER_COLORS.find(({ color }) => color === currentLook[part === "eyes" ? "eyeColor" : "bodyColor"])?.name || "Мой цвет"}</div>
          </>}
          {message && <p role={message.includes("сохранён") ? "status" : "alert"} className={`character-save-status ${message.includes("Не удалось") || message.includes("Войдите") ? "error" : ""}`}>{message}</p>}
          <p className="character-unlock-note">Персонажи будут связаны с уровнем роадмапа позже.</p>
        </section>
      </div>
    </div>
  </section>
}
