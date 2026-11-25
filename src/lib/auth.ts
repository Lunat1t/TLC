import { validateAccountPassword } from "./account-credentials"
import {
  AVATAR_PRESETS,
  ORB_EXPRESSIONS,
  resolveOrbConfig,
  type AvatarPreset,
  type OrbExpressionId,
  type LiveOrbVariant,
} from "@/components/ui/live-orb"
import { createClient as createSupabaseBrowserClient } from "@/utils/supabase/client"
import type { CharacterId, CharacterLook } from "./characters"

export const AUTH_STORAGE_KEY = "tlc.auth.v2"

export interface UserSession {
  id?: string
  login: string
  nickname: string
  loggedInAt: string | null
}

export interface AvatarState {
  presetId: string
  name: string
  variant: LiveOrbVariant
  color: string
  eyeColor: string
  colors: string[]
  expression: OrbExpressionId
  bodyColor: string
  characterEyeColor: string
  characters?: Partial<Record<CharacterId, CharacterLook>>
}

export const DEFAULT_AVATAR_COLORS = { bodyColor: "#d12f20", characterEyeColor: "#ffffff" } as const

export interface AuthState {
  user: UserSession | null
  avatar: AvatarState
}

export function getAvatarPreset(presetId?: string): AvatarPreset {
  return AVATAR_PRESETS.find((item) => item.id === presetId) || AVATAR_PRESETS[0]
}

/**
 * Преобразует логин ученика (например, "Alua") во внутренний технический email
 * с валидным доменом для Supabase Auth, чтобы регистрация работала только по логину.
 */
export function loginToSupabaseEmail(loginInput: string): string {
  const clean = String(loginInput).trim().toLowerCase()
  const slug = clean
    .replace(/[^a-z0-9]/g, (ch) => `x${ch.charCodeAt(0).toString(16)}`)
    .slice(0, 48)
  return `tlc.student.${slug || "user"}@gmail.com`
}

export function validateLoginInput({
  login = "",
  password = "",
}: {
  login?: string
  password?: string
}) {
  const cleanLogin = String(login).trim().replace(/\s+/g, " ")
  const cleanPassword = String(password)
  if (!cleanLogin) {
    throw new Error("Введите логин ученика.")
  }
  if (cleanLogin.length > 64) {
    throw new Error("Логин слишком длинный.")
  }
  if (!/^\d{4}$/.test(cleanPassword)) validateAccountPassword(cleanPassword)
  return { login: cleanLogin }
}

export function validateRegistrationInput({
  login = "",
  password = "",
}: {
  login?: string
  password?: string
}) {
  const cleanLogin = String(login).trim().replace(/\s+/g, " ")
  const cleanPassword = String(password)
  if (!cleanLogin) {
    throw new Error("Введите логин ученика для регистрации.")
  }
  if (cleanLogin.length > 64) {
    throw new Error("Логин слишком длинный.")
  }
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(cleanLogin)) throw new Error("Напишите имя латиницей, без пробелов (до 32 символов).");
  validateAccountPassword(cleanPassword)
  return {
    login: cleanLogin,
    email: loginToSupabaseEmail(cleanLogin),
    password: cleanPassword,
  }
}

export function normalizeAvatarState(rawAvatar?: Partial<AvatarState> | null): AvatarState {
  const preset = getAvatarPreset(rawAvatar?.presetId)
  const orb = resolveOrbConfig({
    ...preset,
    ...(rawAvatar || {}),
  })
  return {
    presetId: rawAvatar?.presetId || preset.id,
    name: rawAvatar?.name || preset.name,
    ...orb,
    expression:
      ORB_EXPRESSIONS.find((item) => item.id === rawAvatar?.expression)?.id || "happy",
    bodyColor: isHexColor(rawAvatar?.bodyColor) ? rawAvatar!.bodyColor! : DEFAULT_AVATAR_COLORS.bodyColor,
    characterEyeColor: isHexColor(rawAvatar?.characterEyeColor) ? rawAvatar!.characterEyeColor! : DEFAULT_AVATAR_COLORS.characterEyeColor,
  }
}

function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

export function loadAuthState(storage?: Storage | null): AuthState {
  const fallbackAvatar = normalizeAvatarState(null)
  if (!storage) {
    return { user: null, avatar: fallbackAvatar }
  }
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return { user: null, avatar: fallbackAvatar }
    }
    const parsed = JSON.parse(raw)
    return {
      user:
        parsed?.user && typeof parsed.user.login === "string"
          ? {
              id: parsed.user.id,
              login: parsed.user.login,
              nickname: parsed.user.nickname || parsed.user.login,
              loggedInAt: parsed.user.loggedInAt || null,
            }
          : null,
      avatar: normalizeAvatarState(parsed?.avatar),
    }
  } catch {
    return { user: null, avatar: fallbackAvatar }
  }
}

export async function readOnboardingProfile(client: ReturnType<typeof createSupabaseBrowserClient>, userId: string) {
  const { data, error } = await client.from("profiles")
    .select("onboarding_complete,role").eq("id", userId).maybeSingle()
  if (error || !data) throw new Error("Не удалось прочитать профиль. Попробуйте ещё раз.")
  return data
}

export async function registerStudentWithSupabase(
  storage: Storage | null | undefined,
  input: {
    login: string
    password: string
    avatar?: Partial<AvatarState>
    age: number | null
    firstName?: string
    lastName?: string
    disciplines?: string[]
    role: "student" | "teacher" | "parent"
  }
): Promise<{ state: AuthState; supabaseUserId?: string }> {
  const { login, email, password } = validateRegistrationInput({
    login: input.login,
    password: input.password,
  })
  if (input.role !== "parent" && (!Number.isInteger(input.age) || input.age === null || input.age < 1 || input.age > 120)) throw new Error("Укажите возраст от 1 до 120 лет.");
  if (!["student", "teacher", "parent"].includes(input.role)) throw new Error("Выберите роль.");
  const nickname = input.firstName && input.lastName ? `${input.firstName.trim()} ${input.lastName.trim()}` : login
  const avatar = normalizeAvatarState(input.avatar)

  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        login,
        nickname,
        avatar,
        disciplines: input.disciplines || [],
        age: input.role === "parent" ? null : input.age,
        first_name: input.firstName?.trim(),
        last_name: input.lastName?.trim(),
        role: input.role,
        onboarding_complete: true,
      },
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("already registered") || msg.includes("duplicate")) {
      throw new Error("Такое сочетание имени и фамилии уже используется. Уточните имя или войдите в свой аккаунт.")
    }
    throw new Error(`Ошибка регистрации: ${error.message}`)
  }

  let session = data.session
  if (data.user?.id && !session) {
    const signedIn = await supabase.auth.signInWithPassword({ email, password })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error("Аккаунт создан, но вход не выполнен. Попробуйте войти по логину и паролю.")
    }
    session = signedIn.data.session
  }
  if (!session) throw new Error("Вход ещё не подтверждён. Попробуйте войти по логину и паролю.")
  const userId = session.user.id

  if (input.avatar) {
    const { error: avatarError } = await supabase.from("profiles").update({ avatar }).eq("id", userId)
    if (avatarError) throw new Error("Не удалось сохранить настройки профиля.")
  }

  const nextState: AuthState = {
    user: {
      id: userId,
      login,
      nickname,
      loggedInAt: new Date().toISOString(),
    },
    avatar,
  }
  cacheAuthDisplay(storage, nextState)
  return { state: nextState, supabaseUserId: userId }
}

export async function signInStudentWithSupabase(
  storage: Storage | null | undefined,
  credentials: { login?: string; password?: string },
  now: Date = new Date()
): Promise<AuthState> {
  const { login } = validateLoginInput(credentials)
  const rawPassword = String(credentials.password || "")
  const password = /^\d{4}$/.test(rawPassword) ? pinPassword(rawPassword) : rawPassword
  const supabase = createSupabaseBrowserClient()
  const resolved = await supabase.rpc("resolve_tlc_pin_login", { p_login: login, p_pin: String(credentials.password || "") });
  if (resolved.error || typeof resolved.data !== "string") throw new Error("Неверный логин или пароль. После нескольких попыток подождите 15 минут.");
  const email = resolved.data
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error("Неверный логин или пароль. Проверьте данные и подключение к сети.")
  }

  const meta = data.user?.user_metadata || {}
  let profileAvatar = meta.avatar as Partial<AvatarState> | undefined
  let profileLogin = String(meta.login || meta.nickname || login)

  if (data.user?.id) {
    try {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("login, nickname, avatar")
        .eq("id", data.user.id)
        .maybeSingle()
      if (profileRow?.avatar) {
        profileAvatar = profileRow.avatar as Partial<AvatarState>
      }
      if (profileRow?.login || profileRow?.nickname) {
        profileLogin = String(profileRow.login || profileRow.nickname)
      }
    } catch {
      // Fallback to auth.users user_metadata
    }
  }

  const current = loadAuthState(storage)
  const nextAvatar = normalizeAvatarState(profileAvatar || current.avatar)

  const next: AuthState = {
    user: {
      id: data.user?.id,
      login: profileLogin,
      nickname: profileLogin,
      loggedInAt: now.toISOString(),
    },
    avatar: nextAvatar,
  }
  cacheAuthDisplay(storage, next)
  return next
}

function cacheAuthDisplay(storage: Storage | null | undefined, state: AuthState) {
  try {
    storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(state))
    storage?.removeItem?.("tlc.supabase.accounts.v1")
  } catch {
    // Supabase cookies own the session. Local storage only remembers display data.
  }
}

export async function syncSessionFromSupabase(
  storage: Storage | null | undefined
): Promise<AuthState> {
  const local = loadAuthState(storage)
  if (typeof window === "undefined") return local

  try {
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase.auth.getSession()
    const user = data.session?.user
    if (!user) {
      const empty = loadAuthState(null);
      storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(empty));
      return empty
    }
    const meta = user.user_metadata || {}
    const loginName = String(
      meta.login || meta.nickname || local.user?.login || "Ученик"
    )
    const synced: AuthState = {
      user: {
        id: user.id,
        login: loginName,
        nickname: loginName,
        loggedInAt: local.user?.loggedInAt || new Date().toISOString(),
      },
      avatar: normalizeAvatarState(
        (meta.avatar as Partial<AvatarState> | undefined) || local.avatar
      ),
    }
    storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(synced))
    return synced
  } catch {
    return local
  }
}

export async function signOutFromSupabase(
  storage: Storage | null | undefined
): Promise<AuthState> {
  const current = loadAuthState(storage)
  if (typeof window !== "undefined") {
    try {
      const supabase = createSupabaseBrowserClient()
      await supabase.auth.signOut()
    } catch {
      // ignore network error on signout
    }
  }
  const next: AuthState = {
    user: null,
    avatar: current.avatar,
  }
  storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function saveAvatarChoice(
  storage: Storage | null | undefined,
  choice: Partial<AvatarState> & { nickname?: string }
): AuthState {
  const current = loadAuthState(storage)
  const avatar = normalizeAvatarState({
    ...current.avatar,
    ...choice,
  })
  const nickname = String(choice.nickname ?? current.user?.nickname ?? "")
    .trim()
    .slice(0, 40)
  const next: AuthState = {
    user: nickname
      ? {
          ...current.user,
          login: current.user?.login || nickname,
          nickname,
          loggedInAt: current.user?.loggedInAt || new Date().toISOString(),
        }
      : current.user,
    avatar,
  }
  storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function signInStudent(
  storage: Storage | null | undefined,
  credentials: { login?: string; password?: string },
  now: Date = new Date()
): AuthState {
  const { login } = validateLoginInput(credentials)
  const current = loadAuthState(storage)
  const next: AuthState = {
    ...current,
    user: {
      login,
      nickname: current.user?.nickname || login,
      loggedInAt: now.toISOString(),
    },
  }
  storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function pinPassword(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("Введите код из четырёх цифр.");
  return `tlc-pin-v1-${pin}`;
}
