import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  let destination = "/login?error=google"
  if (code) {
    const client = createClient(await cookies())
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (!error) destination = "/dashboard"
  }
  const response = NextResponse.redirect(new URL(destination, url.origin))
  response.headers.set("Cache-Control", "private, no-store, max-age=0")
  return response
}
