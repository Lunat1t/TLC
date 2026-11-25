import { NextResponse } from "next/server"
import { publishedPreview } from "@/lib/instructions/public-preview"

export const runtime = "nodejs"
export const maxDuration = 60

const fallbackCover = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><rect width="720" height="480" fill="#eee8dc"/><path d="M360 118 442 200 360 282 278 200z" fill="none" stroke="#575249" stroke-width="12"/><path d="M360 148 412 200 360 252 308 200z" fill="#575249"/></svg>`

function fallbackResponse() {
  return new NextResponse(fallbackCover, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=60, s-maxage=300", "X-Content-Type-Options": "nosniff" },
  })
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return fallbackResponse()
  try {
    const image = await publishedPreview(slug)
    return new NextResponse(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch { return fallbackResponse() }
}
