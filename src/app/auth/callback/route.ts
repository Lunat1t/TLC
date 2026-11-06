import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
export async function GET(request: Request) {
 const url=new URL(request.url);const code=url.searchParams.get("code")
 if(code){const client=createClient(await cookies());const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL("/dashboard",url.origin))}
 return NextResponse.redirect(new URL("/login?error=google",url.origin))
}
