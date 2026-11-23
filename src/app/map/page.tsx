import { RoadmapView } from "@/components/roadmap/roadmap-view"

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ kit?: string }>
}) {
  const { kit } = await searchParams
  return <RoadmapView initialKit={kit} />
}
