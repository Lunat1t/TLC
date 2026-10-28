import { AVATAR_PRESETS, resolveOrbConfig } from './live-orb.js';

export const AUTH_STORAGE_KEY = 'tlc.auth.v1';
export const AVATAR_ROUTE = 'avatar.html';
export const LOGIN_ROUTE = 'login.html';

export function getAvatarPreset(presetId) {
  return AVATAR_PRESETS.find(item => item.id === presetId) || AVATAR_PRESETS[0];
}

export function validateLoginInput({ login = '', password = '' } = {}) {
  const cleanLogin = String(login).trim().replace(/\s+/g, ' ');
  const cleanPassword = String(password);
  if (!cleanLogin) {
    throw new Error('Введите логин или электронную почту.');
  }
  if (cleanLogin.length > 64) {
    throw new Error('Логин слишком длинный.');
  }
  if (cleanPassword.length < 4) {
    throw new Error('Пароль должен содержать минимум 4 символа.');
  }
  return { login: cleanLogin };
}

export function loadAuthState(storage) {
  try {
    const raw = storage?.getItem?.(AUTH_STORAGE_KEY);
    if (!raw) {
      const preset = AVATAR_PRESETS[0];
      return {
        user: null,
        avatar: {
          presetId: preset.id,
          name: preset.name,
          ...resolveOrbConfig(preset),
        },
      };
    }
    const parsed = JSON.parse(raw);
    const preset = getAvatarPreset(parsed?.avatar?.presetId);
    const orb = resolveOrbConfig({
      ...preset,
      ...(parsed?.avatar || {}),
    });
    return {
      user: parsed?.user && typeof parsed.user.login === 'string'
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
    };
  } catch {
    const preset = AVATAR_PRESETS[0];
    return {
      user: null,
      avatar: {
        presetId: preset.id,
        name: preset.name,
        ...resolveOrbConfig(preset),
      },
    };
  }
}

export function saveAvatarChoice(storage, choice = {}) {
  const current = loadAuthState(storage);
  const preset = getAvatarPreset(choice.presetId || current.avatar.presetId);
  const orb = resolveOrbConfig({
    ...preset,
    ...choice,
  });
  const nickname = String(choice.nickname ?? current.user?.nickname ?? '').trim().slice(0, 40);
  const next = {
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
  };
  storage?.setItem?.(AUTH_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function signInStudent(storage, credentials, now = new Date()) {
  const { login } = validateLoginInput(credentials);
  const current = loadAuthState(storage);
  const next = {
    ...current,
    user: {
      login,
      nickname: current.user?.nickname || login,
      loggedInAt: now.toISOString(),
    },
  };
  storage?.setItem?.(AUTH_STORAGE_KEY, JSON.stringify(next));
  return next;
}
