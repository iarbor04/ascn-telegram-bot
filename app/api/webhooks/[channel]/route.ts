import { getChannelAdapter } from "@/lib/channels";

export async function GET(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  if (channel !== "whatsapp") return Response.json({ ok: false }, { status: 405 });
  const url = new URL(request.url);
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (url.searchParams.get("hub.mode") === "subscribe" && expected && url.searchParams.get("hub.verify_token") === expected) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return Response.json({ ok: false }, { status: 403 });
}

export async function POST(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  const adapter = getChannelAdapter(channel);
  if (!adapter) return Response.json({ ok: false, error: "Unknown channel" }, { status: 404 });

  const rawBody = await request.text();
  if (!adapter.verifyWebhook(request.headers, rawBody, request.url)) {
    return Response.json({ ok: false, error: "Invalid webhook signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const messages = adapter.parseWebhook(payload);
  // The normalized messages are ready to be inserted into PostgreSQL or sent to a queue.
  return Response.json({ ok: true, accepted: messages.length });
}
