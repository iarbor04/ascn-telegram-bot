import { ChannelConfigurationError, getChannelAdapter, verifyInternalApiKey } from "@/lib/channels";

export async function POST(request: Request) {
  if (!verifyInternalApiKey(request.headers)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as { channel?: string; recipientId?: string; text?: string; imageUrl?: string } | null;
  if (!body?.channel || !body.recipientId || !body.text) {
    return Response.json({ ok: false, error: "channel, recipientId and text are required" }, { status: 400 });
  }
  const adapter = getChannelAdapter(body.channel);
  if (!adapter) return Response.json({ ok: false, error: "Unknown channel" }, { status: 404 });
  if (!adapter.isConfigured()) return Response.json({ ok: false, error: "Channel is not configured" }, { status: 503 });

  try {
    const result = await adapter.send({ recipientId: body.recipientId, text: body.text, imageUrl: body.imageUrl });
    return Response.json({ ok: true, result });
  } catch (error) {
    const status = error instanceof ChannelConfigurationError ? 503 : 502;
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Channel request failed" }, { status });
  }
}
