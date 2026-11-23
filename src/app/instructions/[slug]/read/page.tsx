import Link from "next/link"
import { notFound } from "next/navigation"
import { serverClient } from "@/lib/instructions/access"
import { publishedCard } from "@/lib/instructions/detail"
import { checkInstructionGate } from "@/lib/instructions/roadmap-gate"
import { PdfReader } from "@/components/instructions/pdf-reader"
import "../../instructions.css"

export default async function ReaderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const card = await publishedCard(slug)
  if (!card?.hasPdf) notFound()

  const gate = await checkInstructionGate(slug)
  if (!gate.allowed) {
    if (gate.code === "not_found") notFound()
    const mapHref = gate.requiredKit ? `/map?kit=${encodeURIComponent(gate.requiredKit)}` : "/map"
    return (
      <main className="instruction-page instruction-detail">
        <Link href={mapHref} className="instruction-back">← На роадмап</Link>
        <section className="instruction-message" aria-label="Доступ по рангу">
          <p className="instruction-kit">{card.kit === "spike" ? "SPIKE Prime" : "LEGO EV3"}</p>
          <h1>{card.title}</h1>
          <p>{gate.message}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginTop: "20px" }}>
            {gate.code === "unauthenticated" ? (
              <Link className="instruction-next" href={`/login?next=${encodeURIComponent(`/instructions/${card.slug}/read`)}`}>
                Войти в аккаунт
              </Link>
            ) : (
              <Link className="instruction-next" href={mapHref}>
                Открыть роадмап
              </Link>
            )}
          </div>
        </section>
      </main>
    )
  }

  let initialUserId = "anon"
  try {
    const client = await serverClient()
    const { data } = await client.auth.getUser()
    if (data.user?.id) initialUserId = data.user.id
  } catch {
    initialUserId = "anon"
  }

  return <PdfReader slug={slug} title={card.title} kit={card.kit} initialUserId={initialUserId} />
}
