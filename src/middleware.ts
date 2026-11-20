import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export function middleware(request: NextRequest) {
  // APIs verify their own access. Public pages/media never need a session refresh.
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || path === "/" || path === "/trial" || path === "/display-camera" || path === "/manifest.webmanifest") {
    return NextResponse.next({ request });
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return NextResponse.next({ request });
  }

  return createClient(request);
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|py|js|css|html)$).*)",
  ],
};
