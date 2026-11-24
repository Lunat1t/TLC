import { NextResponse } from "next/server"
import { verifiedUser, errorResponse, InstructionError } from "@/lib/instructions/access"
import { assertWorkspaceMediaOrigin, parseWorkspaceMediaRequest, uploadWorkspaceImage } from "@/lib/workspace-media-server"
import { prepareWorkspaceMediaSection } from "@/lib/workspace-media"

export const maxDuration = 60
export async function POST(request: Request) {
  try {
    assertWorkspaceMediaOrigin(request)
    const { client, user } = await verifiedUser()
    await parseWorkspaceMediaRequest(request, user.id, 1_000)
    let migrated = 0, failed = 0
    for (const section of ["settings", "board"] as const) {
      let complete = false
      for (let attempt = 0; attempt < 2 && !complete; attempt++) {
        try {
          const { data: row, error } = await client.from("account_workspace").select("value,revision").eq("user_id", user.id).eq("section", section).maybeSingle()
          if (error) throw new InstructionError(503, "workspace_unavailable", "Не удалось прочитать рабочее место.")
          if (!row) { complete = true; continue }
          const prepared = await prepareWorkspaceMediaSection(section, row.value, dataUrl => uploadWorkspaceImage(client, user.id, dataUrl))
          if (!prepared.migrated) { complete = true; continue }
          const { data: revision, error: saveError } = await client.rpc("save_workspace_section", { p_section: section, p_value: prepared.value, p_revision: row.revision })
          if (saveError) throw new InstructionError(503, "workspace_unavailable", "Не удалось обновить рабочее место.")
          if (revision === -1) continue // Another device won the CAS; read fresh data once.
          if (!Number.isSafeInteger(revision) || revision < 1) throw new InstructionError(503, "workspace_unavailable", "Облако не подтвердило сохранение.")
          migrated += prepared.migrated
          complete = true
        } catch { break } // The entire original section remains unchanged on failure.
      }
      if (!complete) failed++
    }
    return NextResponse.json({ userId: user.id, migrated, failed }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
