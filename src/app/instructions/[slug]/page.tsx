import Link from "next/link"
import { notFound } from "next/navigation"
import { publishedCard } from "@/lib/instructions/detail"
import { driveDownloadPath } from "@/lib/instructions/drive-links"
import "../instructions.css"

export default async function InstructionCardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const card = await publishedCard(slug)
  if (!card) notFound()
  const downloadUrl = driveDownloadPath(card.slug, card.hasPdf)
  const coverUrl = card.coverAssetId
    ? `/api/instruction-media/${card.id}/${card.coverAssetId}`
    : card.hasPdf ? `/api/instructions/${encodeURIComponent(card.slug)}/preview` : null
  return <main className="instruction-page instruction-detail">
    <Link href="/instructions" className="instruction-back">← К инструкциям</Link>
    <div className="instruction-detail-layout">
      <div className="instruction-cover instruction-detail-cover">{coverUrl ? <img src={coverUrl} alt="" width={720} height={480} decoding="async" fetchPriority="high" /> : <span aria-hidden="true">◈</span>}</div>
      <div><p className="instruction-kit">{card.kit === "spike" ? "SPIKE Prime" : "LEGO EV3"}</p><h1>{card.title}</h1><p>{card.summary}</p><div className="instruction-topics">{card.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>{downloadUrl ? <><Link className="instruction-next" href={`/instructions/${card.slug}/read`}>Читать инструкцию</Link> <a href={downloadUrl} className="instruction-next" rel="noreferrer" referrerPolicy="no-referrer">Скачать PDF</a></> : <p className="instruction-message">Для этой инструкции пока не подключён PDF.</p>}</div>
    </div>
  </main>
}
