import { createSign, randomUUID } from "node:crypto"
import { InstructionError } from "./access"

const DRIVE_API = "https://www.googleapis.com/drive/v3"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
export const MAX_PDF_BYTES = 100_000_000
const MAX_FOLDER_DEPTH = 4
const MAX_LISTED_FILES = 500

type DriveFile = {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  appProperties?: Record<string, string>
  parents?: string[]
}

type DriveList = { files?: DriveFile[]; nextPageToken?: string }
type DriveListing = { files: DriveFile[]; truncatedByDepth: boolean; truncatedByCount: boolean }
type ServiceToken = { value: string; expiresAt: number }

const cachedTokens = new Map<string, ServiceToken>()

function config() {
  const email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID
  if (!email || !privateKey || !folderId) {
    throw new InstructionError(503, "drive_not_configured", "Подключение Google Drive ещё не настроено.")
  }
  return { email, privateKey, folderId }
}

function base64url(value: string) {
  return Buffer.from(value).toString("base64url")
}

async function accessToken(scope = "https://www.googleapis.com/auth/drive.readonly") {
  const cachedToken = cachedTokens.get(scope)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const { email, privateKey } = config()
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claim = base64url(JSON.stringify({
    iss: email,
    scope,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claim}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  const assertion = `${unsigned}.${signer.sign(privateKey, "base64url")}`
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  })
  if (!response.ok) throw new InstructionError(503, "drive_auth_failed", "Не удалось подключиться к Google Drive. Проверьте настройки service account.")
  const data = await response.json() as { access_token?: string; expires_in?: number }
  if (!data.access_token) throw new InstructionError(503, "drive_auth_failed", "Google Drive не выдал токен доступа.")
  cachedTokens.set(scope, { value: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 })
  return data.access_token
}

async function driveFetch(url: string, init?: RequestInit, scope?: string) {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken(scope)}`, ...init?.headers },
    cache: "no-store",
    signal: init?.signal || AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    if (response.status === 429) {
      throw new InstructionError(503, "drive_rate_limited", "Google Drive временно ограничил запросы. Подождите и попробуйте ещё раз.")
    }
    if (response.status === 403) {
      throw new InstructionError(503, "drive_access_forbidden", "Google Drive отказал в доступе. Проверьте права service account и разрешение на доступ по ссылке.")
    }
    if (response.status === 404) throw new InstructionError(404, "drive_file_not_found", "Файл или папка не найдены в Google Drive.")
    throw new InstructionError(503, "drive_unavailable", "Google Drive временно недоступен.")
  }
  return response
}

async function children(folderId: string) {
  const all: DriveFile[] = []
  let pageToken: string | undefined
  do {
    const query = new URLSearchParams({
      q: `'${folderId.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}' in parents and trashed = false`,
      pageSize: "100",
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,appProperties,parents)",
      orderBy: "name",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    })
    if (pageToken) query.set("pageToken", pageToken)
    const response = await driveFetch(`${DRIVE_API}/files?${query}`)
    const data = await response.json() as DriveList
    all.push(...(data.files || []))
    pageToken = data.nextPageToken
  } while (pageToken && all.length < MAX_LISTED_FILES)
  return { files: all, truncated: Boolean(pageToken) }
}

export async function listConfiguredPdfs() {
  const { folderId } = config()
  const queue: Array<{ id: string; depth: number }> = [{ id: folderId, depth: 0 }]
  const pdfs: DriveFile[] = []
  const visited = new Set<string>()
  let truncatedByDepth = false
  let truncatedByCount = false
  while (queue.length) {
    const current = queue.shift()!
    if (visited.has(current.id)) continue
    visited.add(current.id)
    const listing = await children(current.id)
    const items = listing.files
    truncatedByCount ||= listing.truncated
    for (const item of items) {
      if (item.mimeType === "application/pdf" && Number(item.size) > 0) pdfs.push(item)
      else if (item.mimeType === "application/vnd.google-apps.folder" && current.depth < MAX_FOLDER_DEPTH) {
        queue.push({ id: item.id, depth: current.depth + 1 })
      } else if (item.mimeType === "application/vnd.google-apps.folder") truncatedByDepth = true
      if (pdfs.length >= MAX_LISTED_FILES) return { files: pdfs, truncatedByDepth, truncatedByCount: true } satisfies DriveListing
    }
  }
  return { files: pdfs, truncatedByDepth, truncatedByCount } satisfies DriveListing
}

export async function configuredPdf(fileId: string) {
  const file = (await listConfiguredPdfs()).files.find((candidate) => candidate.id === fileId)
  if (!file) throw new InstructionError(404, "drive_file_not_found", "PDF не найден в подключённой папке.")
  const declaredSize = Number(file.size || 0)
  if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > MAX_PDF_BYTES) {
    throw new InstructionError(413, "file_too_large", "PDF должен быть размером до 100 000 000 байт.")
  }
  return file
}

export async function ownedUploadPdf(fileId: string, uploadId: string) {
  const file = await configuredPdf(fileId)
  if (!/^[0-9a-f-]{36}$/i.test(uploadId) || file.appProperties?.tlcUploadId !== uploadId) {
    throw new InstructionError(403, "drive_upload_not_owned", "Файл не подтверждён как загруженный этой формой Brick Studio.")
  }
  return file
}

export async function verifyPdfSignature(file: Pick<DriveFile, "id">) {
  const signature = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`, {
    headers: { Range: "bytes=0-4" },
  })
  if (signature.status !== 206 || signature.headers.get("Content-Length") !== "5") {
    await signature.body?.cancel()
    throw new InstructionError(503, "drive_signature_check_failed", "Google Drive не смог безопасно проверить начало PDF.")
  }
  const header = Buffer.from(await signature.arrayBuffer()).subarray(0, 5).toString("ascii")
  if (header !== "%PDF-") throw new InstructionError(415, "invalid_pdf", "Загруженный файл не прошёл проверку PDF.")
}

const DRIVE_WRITE_SCOPE = "https://www.googleapis.com/auth/drive"

export async function publicDriveDownloadUrl(fileId: string) {
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(fileId)) {
    throw new InstructionError(404, "drive_file_not_found", "PDF не найден в Google Drive.")
  }
  // Public files download directly from Drive; no service-account token is needed.
  const url = new URL("https://drive.google.com/uc")
  url.searchParams.set("export", "download")
  url.searchParams.set("id", fileId)
  return url.toString()
}

export async function ensurePublicDriveRead(fileId: string) {
  const base = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true`
  const listed = await driveFetch(`${base}&fields=permissions(id,type,role,allowFileDiscovery)`, undefined, DRIVE_WRITE_SCOPE)
  const { permissions = [] } = await listed.json() as { permissions?: Array<{ id?: string; type?: string; role?: string; allowFileDiscovery?: boolean }> }
  const anyonePermission = permissions.find((permission) => permission.type === "anyone")
  if (anyonePermission?.role === "reader" && anyonePermission.allowFileDiscovery !== true) return

  const created = anyonePermission?.id
    ? await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(anyonePermission.id)}?supportsAllDrives=true&fields=id,type,role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "reader", allowFileDiscovery: false }),
    }, DRIVE_WRITE_SCOPE)
    : await driveFetch(`${base}&fields=id,type,role`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    }, DRIVE_WRITE_SCOPE)
  const permission = await created.json() as { type?: string; role?: string }
  if (permission.type !== "anyone" || permission.role !== "reader") {
    throw new InstructionError(503, "drive_public_access_failed", "Не удалось включить скачивание PDF по ссылке в Google Drive.")
  }
}

function safeDriveName(name: string) {
  return name.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 180) || "instruction.pdf"
}

export async function createPdfUploadSession(name: string, size: number) {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PDF_BYTES) {
    throw new InstructionError(413, "file_too_large", "PDF должен быть размером до 100 000 000 байт.")
  }
  const { folderId } = config()
  const token = await accessToken(DRIVE_WRITE_SCOPE)
  const draftFolder = (await children(folderId)).files.find((item) =>
    item.mimeType === "application/vnd.google-apps.folder" && item.name.trim().toLocaleLowerCase("ru") === "черновики",
  )
  const destinationFolderId = draftFolder?.id || folderId
  const uploadId = randomUUID()
  const start = await fetch(`${DRIVE_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,size,mimeType,modifiedTime`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({ name: safeDriveName(name), mimeType: "application/pdf", parents: [destinationFolderId], appProperties: { tlcUploadId: uploadId } }),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  })
  if (!start.ok) {
    if (start.status === 403) throw new InstructionError(503, "drive_write_forbidden", "У сервисного аккаунта нет права загрузки в папку инструкций.")
    if (start.status === 429) throw new InstructionError(503, "drive_rate_limited", "Google Drive временно ограничил загрузки. Попробуйте позже.")
    throw new InstructionError(503, "drive_upload_unavailable", "Не удалось начать загрузку в Google Drive.")
  }
  const sessionUrl = start.headers.get("Location")
  if (!sessionUrl) throw new InstructionError(503, "drive_upload_session_missing", "Google Drive не создал сессию загрузки.")
  return { sessionUrl, uploadId, expectedSize: size }
}

export async function deleteDriveFile(fileId: string) {
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: "DELETE" }, DRIVE_WRITE_SCOPE)
}
