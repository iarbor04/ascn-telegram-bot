import { getChannelAdapter } from "@/lib/channels";
import { getLead, saveOutboundMessage } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { leadId?: string; text?: string } | null;
  const text = body?.text?.trim();
  if (!body?.leadId || !text) return Response.json({ ok: false, error: "leadId and text are required" }, { status: 400 });
  const lead = await getLead(body.leadId);
  if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });
  const [channel, recipientId] = lead.id.split(":", 2);
  const adapter = getChannelAdapter(channel);
  if (!adapter?.isConfigured()) return Response.json({ ok: false, error: "Channel is not configured" }, { status: 503 });
  await adapter.send({ recipientId, text });
  const message = await saveOutboundMessage(lead.id, text);
  return Response.json({ ok: true, message });
}
