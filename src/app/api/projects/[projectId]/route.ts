import { NextResponse } from "next/server"
import { verifiedUser, errorResponse, InstructionError } from "@/lib/instructions/access"
import {
  PROJECT_BODY_MAX_BYTES, projectHeaders, projectDatabaseError,
  validateProjectId, validateProjectValue, validateProjectRevision,
} from "@/lib/project-api"

type Context = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, context: Context) {
  try {
    const { client, user } = await verifiedUser()
    const { projectId } = await context.params
    validateProjectId(projectId)
    const { data, error } = await client.from("account_projects")
      .select("project_id,value,revision")
      .eq("user_id", user.id).eq("project_id", projectId).maybeSingle()
    if (error) projectDatabaseError(error)
    if (!data) throw new InstructionError(404, "project_not_found", "Программа не найдена.")
    return NextResponse.json({ userId: user.id, id: data.project_id, value: data.value, revision: data.revision }, { headers: projectHeaders })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) throw new InstructionError(403, "origin", "Недопустимый источник.")
    const { client, user } = await verifiedUser()
    const { projectId } = await context.params
    validateProjectId(projectId)
    const text = await request.text()
    if (new TextEncoder().encode(text).byteLength > PROJECT_BODY_MAX_BYTES) throw new InstructionError(413, "project_size", "Программа слишком большая.")
    let body: Record<string, unknown>
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error()
      body = parsed as Record<string, unknown>
    } catch {
      throw new InstructionError(400, "invalid", "Неверный формат программы.")
    }
    if (body.userId !== user.id) throw new InstructionError(409, "account_changed", "Аккаунт изменился. Обновите страницу.")
    validateProjectRevision(body.revision)
    validateProjectValue(projectId, body.value)
    const { data, error } = await client.rpc("save_account_project", {
      p_project_id: projectId, p_value: body.value, p_revision: body.revision,
    })
    if (error) projectDatabaseError(error)
    if (data === -1) throw new InstructionError(409, "conflict", "Программа изменена на другом устройстве. Загрузите её новую версию.")
    if (!Number.isInteger(data) || data < 1) throw new InstructionError(503, "projects_unavailable", "Облако не подтвердило сохранение программы.")
    return NextResponse.json({ userId: user.id, id: projectId, value: body.value, revision: data }, { headers: projectHeaders })
  } catch (error) {
    return errorResponse(error)
  }
}
