import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { validateControllerConfig } from "@/lib/controller-layout"

const noStore = { "Cache-Control": "private, no-store" }

async function currentUser() {
  const client = createClient(await cookies())
  const { data, error } = await client.auth.getUser()
  return { client, user: error ? null : data.user }
}

export async function GET() {
  try {
    const { user } = await currentUser()
    if (!user) return NextResponse.json({ error: { message: "Войдите в Brick Studio." } }, { status: 401, headers: noStore })
    let config = null
    try {
      if (user.user_metadata?.controller_layout) {
        config = validateControllerConfig(user.user_metadata.controller_layout)
      }
    } catch { /* Повреждённая настройка не должна блокировать пульт. */ }
    return NextResponse.json(
      { config, updatedAt: user.user_metadata?.controller_layout_updated_at ?? null },
      { headers: noStore }
    )
  } catch { return NextResponse.json({ error: { message: "Не удалось загрузить раскладку." } }, { status: 500, headers: noStore }) }
}

export async function PUT(request: Request) {
  try {
    const { client, user } = await currentUser()
    if (!user) return NextResponse.json({ error: { message: "Войдите в Brick Studio." } }, { status: 401, headers: noStore })
    let raw
    try { raw = await request.json() }
    catch { return NextResponse.json({ error: { message: "Неверный JSON." } }, { status: 400, headers: noStore }) }
    let config
    try { config = validateControllerConfig(raw?.config) }
    catch (error) {
      return NextResponse.json({ error: { message: error instanceof Error ? error.message : "Неверная раскладка." } }, { status: 400, headers: noStore })
    }
    const updatedAt = new Date().toISOString()
    const { error } = await client.auth.updateUser({
      data: {
        ...user.user_metadata,
        controller_layout: config,
        controller_layout_updated_at: updatedAt,
      },
    })
    if (error) throw error
    return NextResponse.json(
      { config, updatedAt },
      { headers: noStore }
    )
  } catch { return NextResponse.json({ error: { message: "Не удалось сохранить раскладку." } }, { status: 500, headers: noStore }) }
}
