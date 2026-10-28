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
  email?: string
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

export function loginToSupabaseEmail(loginInput: string): string {
  const clean = String(loginInput).trim()
  if (clean.includes("@")) {
    return clean.toLowerCase()
  }
  const slug = clean
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, (ch) => `u${ch.charCodeAt(0).toString(16)}`)
  return `${slug || "student"}@tlc-robot.ru`
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
    throw new Error("Введите логин или электронную почту.")
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
    throw new Error("Введите логин или электронную почту для регистрации.")
  }
  if (cleanLogin.length > 64) {
    throw new Error("Логин слишком длинный.")
  }
  if (cleanPassword.length < 6) {
    throw new Error("Пароль для Supabase должен содержать минимум 6 символов.")
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
              email: parsed.user.email,
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
  email: string,
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
    existing[email] = record
    storage.setItem(PENDING_ACCOUNTS_KEY, JSON.stringify(existing))
  } catch {
    // ignore storage quota errors
  }
}

function getVerifiedAccountCache(
  storage: Storage | null | undefined,
  email: string
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
    return existing[email] || null
  } catch {
    return null
  }
}

export async function registerStudentWithSupabase(
  storage: Storage | null | undefined,
  input: {
    login: string
    password: string
    nickname?: string
    avatar: Partial<AvatarState>
  }
): Promise<{ state: AuthState; supabaseUserId?: string }> {
  const { login, email, password } = validateRegistrationInput({
    login: input.login,
    password: input.password,
  })
  const nickname = String(input.nickname || login).trim().slice(0, 40) || login
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
    if (error.message.toLowerCase().includes("already registered")) {
      throw new Error("Такой пользователь уже зарегистрирован в Supabase. Перейдите ко входу.")
    }
    throw new Error(`Ошибка регистрации в Supabase: ${error.message}`)
  }

  const userId = data.user?.id

  // Если в Supabase создана таблица public.profiles — сохраняем профиль и туда
  if (userId) {
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
      // Таблица profiles опциональна, основные метаданные уже сохранены в auth.users
    }
  }

  saveVerifiedAccountCache(storage, email, {
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
      email,
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
    // Если в Supabase включено подтверждение почты (Email not confirmed),
    // проверяем только что созданный аккаунт из кэша регистрации
    const cached = getVerifiedAccountCache(storage, email)
    if (
      error.message.toLowerCase().includes("email not confirmed") &&
      cached &&
      cached.password === password
    ) {
      const confirmedState: AuthState = {
        user: {
          id: cached.id,
          login: cached.login,
          email,
          nickname: cached.nickname,
          loggedInAt: now.toISOString(),
        },
        avatar: normalizeAvatarState(cached.avatar),
      }
      storage?.setItem(AUTH_STORAGE_KEY, JSON.stringify(confirmedState))
      return confirmedState
    }

    if (error.message.toLowerCase().includes("email not confirmed")) {
      throw new Error(
        "Аккаунт создан в Supabase, но ожидает подтверждения email (отключите 'Confirm email' в Supabase -> Authentication -> Providers -> Email)."
      )
    }

    throw new Error(
      "Неверный логин или пароль в Supabase. Если у вас ещё нет аккаунта, нажмите «Регистрация»."
    )
  }

  const meta = data.user?.user_metadata || {}
  let profileAvatar = meta.avatar as Partial<AvatarState> | undefined
  let profileNickname = (meta.nickname || meta.login || login) as string

  if (data.user?.id) {
    try {
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("nickname, avatar")
        .eq("id", data.user.id)
        .maybeSingle()
      if (profileRow?.avatar) {
        profileAvatar = profileRow.avatar as Partial<AvatarState>
      }
      if (profileRow?.nickname) {
        profileNickname = String(profileRow.nickname)
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
      login: String(meta.login || login),
      email: data.user?.email || email,
      nickname: profileNickname,
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
    const synced: AuthState = {
      user: {
        id: data.user.id,
        login: String(meta.login || data.user.email || local.user?.login || "student"),
        email: data.user.email,
        nickname: String(
          meta.nickname || meta.login || local.user?.nickname || data.user.email?.split("@")[0] || "Ученик"
        ),
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
