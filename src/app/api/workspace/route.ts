import { NextResponse } from "next/server"
import { verifiedUser, errorResponse, InstructionError } from "@/lib/instructions/access"
import { validateProject } from "@/lib/projects"

const headers = { "Cache-Control": "private, no-store" }
const sections = ["settings", "layout", "board", "projects"] as const
const MAX_BYTES = 3_500_000

function validateValue(section: string, value: unknown) {
  const isArray = section === "board" || section === "projects"
  if (value === null || typeof value !== "object" || Array.isArray(value) !== isArray) {
    throw new InstructionError(400, "invalid", "Неверные данные рабочего места.")
  }
  if (section !== "projects") return

  const ids = new Set<string>()
  for (const project of value as unknown[]) {
    try {
      const clean = validateProject(project)
      // validateProject also accepts inherited HUBS keys; cloud storage accepts only real hub types.
      if (clean.hub !== "spike" && clean.hub !== "ev3") throw Error()
      if (ids.has(clean.id)) throw Error()
      ids.add(clean.id)
    } catch {
      throw new InstructionError(400, "invalid_projects", "Список программ повреждён или содержит повторяющиеся идентификаторы.")
    }
  }
  // Persist the original records, retaining unknown fields and nested workspace data.
}

export async function GET(request: Request) {
  try {
    const { client, user } = await verifiedUser()
    let query = client
      .from("account_workspace")
      .select("section,value,revision")
      .eq("user_id", user.id)
    if (request.headers.get("X-TLC-Program-Storage") === "records") query = query.neq("section", "projects")
    const { data, error } = await query
    if (error) throw new InstructionError(503, "workspace_unavailable", "Облачное рабочее место недоступно.")
    return NextResponse.json({ userId: user.id, sections: data ?? [] }, { headers })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) {
      throw new InstructionError(403, "origin", "Недопустимый источник.")
    }
    const { client, user } = await verifiedUser()
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) {
      throw new InstructionError(413, "size", "Рабочее место слишком большое.")
    }
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error()
      body = parsed as Record<string, unknown>
    } catch {
      throw new InstructionError(400, "invalid", "Неверный формат данных рабочего места.")
    }
    if (body.userId !== user.id) {
      throw new InstructionError(409, "account_changed", "Аккаунт изменился. Обновите страницу.")
    }
    if (!sections.includes(body.section as typeof sections[number]) || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0) {
      throw new InstructionError(400, "invalid", "Неверная секция или версия рабочего места.")
    }
    if (body.section === "projects") {
      throw new InstructionError(409, "client_upgrade_required", "Хранилище программ обновлено. Обновите страницу перед сохранением; локальная копия сохранится.")
    }
    validateValue(body.section as string, body.value)
    const { data, error } = await client.rpc("save_workspace_section", {
      p_section: body.section,
      p_value: body.value,
      p_revision: body.revision,
    })
    if (error) {
      if (error.code === "23514" && error.message.includes("account_workspace_value_check")) {
        throw new InstructionError(413, "size", "Рабочее место слишком большое.")
      }
      if (body.section === "projects" && error.code === "23514") {
        throw new InstructionError(503, "workspace_migration_required", "Облачное сохранение программ ещё не настроено. Обратитесь к администратору.")
      }
      throw new InstructionError(503, "workspace_unavailable", "Не удалось сохранить в аккаунте.")
    }
    if (data === -1) {
      throw new InstructionError(409, "conflict", "Рабочее место изменено на другом устройстве. Загрузите изменения и повторите сохранение.")
    }
    if (!Number.isSafeInteger(data) || data < 1) {
      throw new InstructionError(503, "workspace_unavailable", "Облако не подтвердило сохранение. Повторите попытку.")
    }
    return NextResponse.json({ userId: user.id, revision: data }, { headers })
  } catch (error) {
    return errorResponse(error)
  }
}
