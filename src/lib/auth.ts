import {
  AVATAR_PRESETS,
  resolveOrbConfig,
  type AvatarPreset,
  type LiveOrbVariant,
} from "@/components/ui/live-orb"

export const AUTH_STORAGE_KEY = "tlc.auth.v1"

export interface UserSession {
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

export function loadAuthState(storage?: Storage | null): AuthState {
  const fallbackPreset = AVATAR_PRESETS[0]
  const fallbackOrb = resolveOrbConfig(fallbackPreset)
  if (!storage) {
    return {
      user: null,
      avatar: {
        presetId: fallbackPreset.id,
        name: fallbackPreset.name,
        ...fallbackOrb,
      },
    }
  }
  try {
    const raw = storage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return {
        user: null,
        avatar: {
          presetId: fallbackPreset.id,
          name: fallbackPreset.name,
          ...fallbackOrb,
        },
      }
    }
    const parsed = JSON.parse(raw)
    const preset = getAvatarPreset(parsed?.avatar?.presetId)
    const orb = resolveOrbConfig({
      ...preset,
      ...(parsed?.avatar || {}),
    })
    return {
      user:
        parsed?.user && typeof parsed.user.login === "string"
          ? {
              login: parsed.user.login,
              nickname: parsed.user.nickname || parsed.user.login,
              loggedInAt: parsed.user.loggedInAt || null,
            }
          : null,
      avatar: {
        presetId: parsed?.avatar?.presetId || preset.id,
        name: parsed?.avatar?.name || preset.name,
        ...orb,
      },
    }
  } catch {
    return {
      user: null,
      avatar: {
        presetId: fallbackPreset.id,
        name: fallbackPreset.name,
        ...fallbackOrb,
      },
    }
  }
}

export function saveAvatarChoice(
  storage: Storage | null | undefined,
  choice: Partial<AvatarState> & { nickname?: string }
): AuthState {
  const current = loadAuthState(storage)
  const preset = getAvatarPreset(choice.presetId || current.avatar.presetId)
  const orb = resolveOrbConfig({
    ...preset,
    ...choice,
  })
  const nickname = String(choice.nickname ?? current.user?.nickname ?? "")
    .trim()
    .slice(0, 40)
  const next: AuthState = {
    user: nickname
      ? {
          login: current.user?.login || nickname,
          nickname,
          loggedInAt: current.user?.loggedInAt || new Date().toISOString(),
        }
      : current.user,
    avatar: {
      presetId: choice.presetId || preset.id,
      name: choice.name || preset.name,
      ...orb,
    },
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
