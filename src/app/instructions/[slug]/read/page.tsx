import { notFound } from "next/navigation"
import { publishedCard } from "@/lib/instructions/detail"
import { PdfReader } from "@/components/instructions/pdf-reader"
import "../../instructions.css"
export default async function ReaderPage({params}:{params:Promise<{slug:string}>}){const {slug}=await params;const card=await publishedCard(slug);if(!card?.hasPdf)notFound();return <PdfReader slug={slug} title={card.title}/>}
