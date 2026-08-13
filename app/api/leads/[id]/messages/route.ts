import { listMessages, markLeadRead } from "@/lib/store";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  await markLeadRead(id);
  return Response.json({ messages: await listMessages(id) });
}
