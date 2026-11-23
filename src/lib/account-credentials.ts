/** Shared form rules. Passwords are never trimmed or saved to browser storage. */
export function fullNameLogin(firstName: string, lastName: string): string {
  const first = firstName.trim()
  const last = lastName.trim()
  if (!/^[A-Za-z][A-Za-z-]*$/.test(first) || !/^[A-Za-z][A-Za-z-]*$/.test(last)) {
    throw new Error("Напишите имя и фамилию английскими буквами, без пробелов.")
  }
  const login = `${first}_${last}`
  if (login.length > 32) throw new Error("Имя и фамилия вместе должны быть не длиннее 31 символа.")
  return login
}

export function validateAccountPassword(password: string): string {
  if (password.length < 8) throw new Error("Пароль должен содержать не меньше 8 символов.")
  if (new TextEncoder().encode(password).length > 72) throw new Error("Пароль слишком длинный: максимум 72 байта.")
  return password
}

export const NICKNAME_MAX_LENGTH = 60

export function validateNickname(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error("Укажите имя.")
  if (trimmed.length > NICKNAME_MAX_LENGTH) {
    throw new Error(`Имя должно быть не длиннее ${NICKNAME_MAX_LENGTH} символов.`)
  }
  return trimmed
}
