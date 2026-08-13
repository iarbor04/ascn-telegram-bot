import { getChannelAdapter } from "@/lib/channels";
import { saveInboundMessages } from "@/lib/store";
import { enrollInboundMessages } from "@/lib/automations";
import { processDueAutomations } from "@/lib/automation-runner";
import { getWhatsAppConfigSync } from "@/lib/channel-config";
import { sendOperatorNotifications } from "@/lib/notification-settings";

export async function GET(request: Request, context: { params: Promise<{ channel: string }> }) {
  const { channel } = await context.params;
  if (channel !== "whatsapp") return Response.json({ ok: false }, { status: 405 });
  const url = new URL(request.url);
  const expected = getWhatsAppConfigSync()?.verifyToken;
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
  const accepted = await saveInboundMessages(messages);
  await enrollInboundMessages(messages);
  await sendOperatorNotifications(messages);
  void processDueAutomations();
  return Response.json({ ok: true, accepted });
}
