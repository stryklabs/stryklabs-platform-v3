export async function triggerEvent(event: string, payload: any) {
  console.log(`Event triggered: ${event}`, payload);
  // Future: integrate job queue / background worker
}
