import { JoinSchoolForm } from "@/components/billing/join-school-form"

export default async function JoinSchoolPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  const { code } = await searchParams
  return (
    <main className="bs-billing-page" style={{ width: "min(640px, 100%)" }}>
      <JoinSchoolForm initialCode={typeof code === "string" ? code : ""} />
    </main>
  )
}
