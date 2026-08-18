import { ChannelConfigurationError, getChannelAdapter } from "@/lib/channels";
import { getLead, saveOutboundMessage } from "@/lib/store";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { leadId?: string; text?: string; imageUrl?: string } | null;
  const text = body?.text?.trim() || "";
  const imageUrl = body?.imageUrl?.startsWith("/api/uploads/") ? body.imageUrl : undefined;
  if (!body?.leadId || (!text && !imageUrl)) return Response.json({ ok: false, error: "text or image is required" }, { status: 400 });
  const lead = await getLead(body.leadId);
  if (!lead) return Response.json({ ok: false, error: "Lead not found" }, { status: 404 });
  const [channel, recipientId] = lead.id.split(":", 2);
  const adapter = getChannelAdapter(channel);
  if (!adapter?.isConfigured()) return Response.json({ ok: false, error: "Channel is not configured" }, { status: 503 });
  try {
    await adapter.send({ recipientId, text, imageUrl });
  } catch (error) {
    const status = error instanceof ChannelConfigurationError ? 503 : 502;
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Канал не принял сообщение" }, { status });
  }
  const message = await saveOutboundMessage(lead.id, text, imageUrl);
  return Response.json({ ok: true, message });
}
