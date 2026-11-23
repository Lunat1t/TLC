import { TeacherRoadmapAdmin } from "@/components/roadmap/teacher-roadmap-admin"

export default async function TeacherRoadmapPage({
  searchParams,
}: {
  searchParams: Promise<{ kit?: string }>
}) {
  const { kit } = await searchParams
  return <TeacherRoadmapAdmin initialKit={kit} />
}
