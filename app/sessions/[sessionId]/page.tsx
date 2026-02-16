import SessionDetailClient from "@/app/admin/sessions/[sessionId]/SessionDetailClient";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionDetailClient sessionId={sessionId} />;

}
