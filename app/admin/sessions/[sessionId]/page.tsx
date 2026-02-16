import SessionDetailGate from './SessionDetailGate';

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <SessionDetailGate sessionId={sessionId} />;
}
