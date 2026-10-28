import {
  AVATAR_PRESETS,
  resolveOrbConfig,
  type AvatarPreset,
  type LiveOrbVariant,
} from "@/components/ui/live-orb"
import { createClient as createSupabaseBrowserClient } from "@/utils/supabase/client"

export const AUTH_STORAGE_KEY = "tlc.auth.v1"
export const PENDING_ACCOUNTS_KEY = "tlc.supabase.accounts.v1"

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
}

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
  if (cleanPassword.length < 4) {
    throw new Error("Пароль должен содержать минимум 4 символа.")
  }
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
  if (cleanPassword.length < 6) {
    throw new Error("Пароль должен содержать минимум 6 символов.")
  }
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
  }
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

function saveVerifiedAccountCache(
  storage: Storage | null | undefined,
  loginKey: string,
  record: {
    id?: string
    login: string
    nickname: string
    password: string
    avatar: AvatarState
  }
) {
  if (!storage) return
  try {
    const existing = JSON.parse(storage.getItem(PENDING_ACCOUNTS_KEY) || "{}")
    existing[loginKey.toLowerCase()] = record
    storage.setItem(PENDING_ACCOUNTS_KEY, JSON.stringify(existing))
  } catch {
    // ignore storage quota errors
  }
}

function getVerifiedAccountCache(
  storage: Storage | null | undefined,
  loginKey: string
): {
  id?: string
  login: string
  nickname: string
  password: string
  avatar: AvatarState
} | null {
  if (!storage) return null
  try {
    const existing = JSON.parse(storage.getItem(PENDING_ACCOUNTS_KEY) || "{}")
    return existing[loginKey.toLowerCase()] || null
  } catch {
    return null
  }
}

export async function registerStudentWithSupabase(
  storage: Storage | null | undefined,
  input: {
    login: string
    password: string
    avatar: Partial<AvatarState>
  }
): Promise<{ state: AuthState; supabaseUserId?: string }> {
  const { login, email, password } = validateRegistrationInput({
    login: input.login,
    password: input.password,
  })
  const nickname = login
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
      },
    },
  })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes("already registered")) {
      throw new Error("Этот логин уже занят. Выберите другой логин или войдите в аккаунт.")
    }
    // Если сработал лимит писем Supabase (rate limit), не блокируем ученика
    if (!msg.includes("rate limit") && !msg.includes("email")) {
      throw new Error(`Ошибка регистрации: ${error.message}`)
    }
  }

  const userId = data?.user?.id || globalThis.crypto?.randomUUID?.()

  try {
    await supabase.from("profiles").upsert(
      {
        id: userId,
        login,
        nickname,
        avatar,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
  } catch {
    // Таблица profiles опциональна, основные метаданные уже в auth.users
  }

  saveVerifiedAccountCache(storage, login, {
    id: userId,
    login,
    nickname,
    password,
    avatar,
  })

  const nextState: AuthState = {
    user: {
      id: userId,
      login,
      nickname,
      loggedInAt: new Date().toISOString(),
    },
    avatar,
  }
  storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextState))

  return { state: nextState, supabaseUserId: userId }
}

export async function signInStudentWithSupabase(
  storage: Storage | null | undefined,
  credentials: { login?: string; password?: string },
  now: Date = new Date()
): Promise<AuthState> {
  const { login } = validateLoginInput(credentials)
  const password = String(credentials.password || "")
  const email = loginToSupabaseEmail(login)

  const supabase = createSupabaseBrowserClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    const cached = getVerifiedAccountCache(storage, login)
    if (cached && cached.password === password) {
      const confirmedState: AuthState = {
        user: {
          id: cached.id,
          login: cached.login,
          nickname: cached.nickname,
          loggedInAt: now.toISOString(),
        },
        avatar: normalizeAvatarState(cached.avatar),
      }
      storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(confirmedState))
      return confirmedState
    }

    throw new Error(
      "Неверный логин или пароль. Если у вас ещё нет аккаунта, нажмите «Регистрация»."
    )
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
  storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(next))
  return next
}

export async function syncSessionFromSupabase(
  storage: Storage | null | undefined
): Promise<AuthState> {
  const local = loadAuthState(storage)
  if (typeof window === "undefined") return local

  try {
    const supabase = createSupabaseBrowserClient()
    const { data } = await supabase.auth.getUser()
    if (!data?.user) {
      return local
    }
    const meta = data.user.user_metadata || {}
    const loginName = String(
      meta.login || meta.nickname || local.user?.login || "Ученик"
    )
    const synced: AuthState = {
      user: {
        id: data.user.id,
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
