"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Check, Eye, Gem, UserRound } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { DEFAULT_AVATAR_COLORS, type AvatarState } from "@/lib/auth"
import AvatarDarwinV3 from "./avatar-darwin-v3"
import { MixMatchAccessoryArt } from "./mix-match-accessory-art"
import { useAccess } from "@/components/auth/access-provider"
import { useAvatarMotion } from "./use-avatar-motion"
import "./avatar-editor.css"

type Part = "body" | "eyes" | "accessory"

const PALETTE = [
  { name: "Голубой", color: "#43c5e4" },
  { name: "Красный", color: "#ef5b64" },
  { name: "Оранжевый", color: "#ff9b45" },
  { name: "Жёлтый", color: "#ffd34e" },
  { name: "Зелёный", color: "#57c785" },
  { name: "Бирюзовый", color: "#35c8b0" },
  { name: "Фиолетовый", color: "#9875ed" },
  { name: "Розовый", color: "#ee82b4" },
  { name: "Белый", color: "#f2f5f7" },
  { name: "Графитовый", color: "#414b5b" },
]

export function AvatarEditor({ initialAvatar }: { initialAvatar: Partial<AvatarState> | null }) {
  const { characterRef, gazeRef, eyelidsRef } = useAvatarMotion({ centerX: 344.5, centerY: 250 })
  const { updateProfile } = useAccess()
  const [avatar, setAvatar] = useState({
    bodyColor: initialAvatar?.bodyColor || DEFAULT_AVATAR_COLORS.bodyColor,
    characterEyeColor: initialAvatar?.characterEyeColor || DEFAULT_AVATAR_COLORS.characterEyeColor,
  })
  const [part, setPart] = useState<Part>("body")
  const [accessoryUnlocked, setAccessoryUnlocked] = useState(false)
  const [accessoryEquipped, setAccessoryEquipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const saveVersionRef = useRef(0)

  useEffect(() => {
    let active = true
    void createClient().rpc("get_my_mix_match_wardrobe").then(({ data, error }) => {
      if (!active || error || !data) return
      const status = data as { accessory_unlocked?: boolean; accessory_equipped?: boolean }
      setAccessoryUnlocked(status.accessory_unlocked === true)
      setAccessoryEquipped(status.accessory_equipped === true)
    })
    return () => {
      active = false
    }
  }, [])

  async function toggleAccessory() {
    setBusy(true)
    setMessage("")
    try {
      const nextEquipped = !accessoryEquipped
      const { error } = await createClient().rpc("set_my_mix_match_accessory", { p_equipped: nextEquipped })
      if (error) throw error
      setAccessoryEquipped(nextEquipped)
      setMessage(nextEquipped ? "Аксессуар надет на аватар." : "Аксессуар снят.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось обновить аксессуар.")
    } finally {
      setBusy(false)
    }
  }

  async function persistAvatar(nextColors: typeof avatar, version: number) {
    try {
      const client = createClient()
      const { data: { user }, error: userError } = await client.auth.getUser()
      if (userError || !user) throw new Error("Войдите в аккаунт, чтобы сохранить аватар.")

      const { data: profile, error: readError } = await client
        .from("profiles")
        .select("avatar")
        .eq("id", user.id)
        .single()
      if (readError) throw readError

      const nextAvatar = { ...(profile.avatar || {}), ...nextColors }
      delete nextAvatar.eyeExpression
      delete nextAvatar.mouthExpression
      const { error: saveError } = await client
        .from("profiles")
        .update({ avatar: nextAvatar, updated_at: new Date().toISOString() })
        .eq("id", user.id)
      if (saveError) throw saveError
      updateProfile({ avatar: nextAvatar })

      const { error: metadataError } = await client.auth.updateUser({ data: { avatar: nextAvatar } })
      if (metadataError) throw metadataError

      if (version === saveVersionRef.current) setMessage("Аватар сохранён")
    } catch (error) {
      if (version === saveVersionRef.current) setMessage(error instanceof Error ? error.message : "Не удалось сохранить аватар.")
    } finally {
      if (version === saveVersionRef.current) setBusy(false)
    }
  }

  function scheduleAvatarSave(nextColors: typeof avatar) {
    const version = ++saveVersionRef.current
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setBusy(true)
    setMessage("Сохраняем…")
    saveTimerRef.current = setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current
        .catch(() => {})
        .then(() => persistAvatar(nextColors, version))
    }, 250)
  }

  function choosePart(nextPart: Part) {
    setPart(nextPart)
    setMessage("")
  }

  return (
    <section className="avatar-editor" aria-labelledby="avatar-editor-title">
      <div className="avatar-editor-layout">
        <div className={`avatar-stage camera-${part}`}>
          <div className="avatar-editor-heading">
            <h2 id="avatar-editor-title">Настрой аватар</h2>
          </div>
          <div className="avatar-character-wrap" aria-label="Предпросмотр персонажа">
            <AvatarDarwinV3
              className="avatar-character"
              viewBox={accessoryEquipped ? "0 -50 689 1110" : "0 0 689 1060"}
              bodyColor={avatar.bodyColor}
              eyeColor={avatar.characterEyeColor}
              characterRef={characterRef}
              gazeRef={gazeRef}
              eyelidsRef={eyelidsRef}
              animate
            >
              {accessoryEquipped && <MixMatchAccessoryArt transform="translate(266.5 -35)" />}
            </AvatarDarwinV3>
          </div>
        </div>

        <div className="avatar-customizer">
          <div className={`avatar-tabs ${accessoryUnlocked ? "with-accessory" : ""}`} role="tablist" aria-label="Настройки аватара">
            <button type="button" role="tab" aria-label="Тело" title="Тело" aria-selected={part === "body"} className={part === "body" ? "active" : ""} onClick={() => choosePart("body")}>
              <UserRound size={23} />
            </button>
            <button type="button" role="tab" aria-label="Глаза" title="Глаза" aria-selected={part === "eyes"} className={part === "eyes" ? "active" : ""} onClick={() => choosePart("eyes")}>
              <Eye size={23} />
            </button>
            {accessoryUnlocked && <button type="button" role="tab" aria-label="Аксессуар" title="Аксессуар" aria-selected={part === "accessory"} className={part === "accessory" ? "active" : ""} onClick={() => choosePart("accessory")}>
              <Gem size={23} />
            </button>}
          </div>
          {part === "accessory" ? <div className="avatar-accessory-control">
            <div className="avatar-accessory-art"><svg viewBox="0 0 156 125" role="img" aria-label="Аксессуар со смесительными ёмкостями"><MixMatchAccessoryArt /></svg></div>
            <div><h3>Смеситель Mix and Match</h3><p>Аксессуар для аватара</p></div>
            <button type="button" className="avatar-accessory-toggle" onClick={() => void toggleAccessory()} disabled={busy}>{busy ? "Сохраняем…" : accessoryEquipped ? "Снять" : "Надеть"}</button>
          </div> : <>
            <div className="avatar-color-heading"><div><h3>Цвет {part === "eyes" ? "глаз" : "тела"}</h3><p>Выбери любимый оттенок</p></div><span className="avatar-current-color" style={{ backgroundColor: avatar[part === "eyes" ? "characterEyeColor" : "bodyColor"] }} /></div>
            <div className="avatar-palette" aria-label={`Цвет ${part === "eyes" ? "глаз" : "тела"}`}>
              {PALETTE.map(({ name, color }) => {
                const selected = avatar[part === "eyes" ? "characterEyeColor" : "bodyColor"] === color
                return <button key={color} type="button" className={`avatar-swatch ${selected ? "selected" : ""} ${color === "#f2f5f7" ? "light" : ""}`} style={{ "--swatch": color } as CSSProperties} aria-label={name} aria-pressed={selected} onClick={() => { const nextColors = { ...avatar, [part === "eyes" ? "characterEyeColor" : "bodyColor"]: color }; setAvatar(nextColors); scheduleAvatarSave(nextColors) }}>{selected && <Check size={16} />}</button>
              })}
            </div>
            <div className="avatar-color-label">{PALETTE.find(({ color }) => color === avatar[part === "eyes" ? "characterEyeColor" : "bodyColor"])?.name || "Мой цвет"}</div>
          </>}
          {message && <div className="avatar-save-row"><p role="status" className={message === "Аватар сохранён" ? "success" : message === "Сохраняем…" ? "saving" : "error"}>{message}</p></div>}
        </div>
      </div>
    </section>
  )
}
