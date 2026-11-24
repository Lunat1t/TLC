import { NextResponse } from "next/server"
import { verifiedUser, errorResponse } from "@/lib/instructions/access"
import { PROJECT_PAGE_SIZE, projectHeaders, projectDatabaseError, validateProjectId } from "@/lib/project-api"

export async function GET(request: Request) {
  try {
    const { client, user } = await verifiedUser()
    const after = new URL(request.url).searchParams.get("after")
    if (after !== null) validateProjectId(after)
    let query = client.from("account_projects")
      .select("project_id,revision,deleted_at")
      .eq("user_id", user.id)
      .order("project_id", { ascending: true })
      .limit(PROJECT_PAGE_SIZE + 1)
    if (after !== null) query = query.gt("project_id", after)
    const { data, error } = await query
    if (error) projectDatabaseError(error)
    const rows = data ?? []
    const page = rows.slice(0, PROJECT_PAGE_SIZE)
    return NextResponse.json({
      userId: user.id,
      projects: page.map(row => ({ id: row.project_id, revision: row.revision, deleted: row.deleted_at !== null })),
      nextCursor: rows.length > PROJECT_PAGE_SIZE ? page[page.length - 1].project_id : null,
    }, { headers: projectHeaders })
  } catch (error) {
    return errorResponse(error)
  }
}
