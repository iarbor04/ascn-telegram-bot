import { randomBytes } from "node:crypto";
import { getWhatsAppConfigSync, removeWhatsAppConfig, saveWhatsAppConfig } from "@/lib/channel-config";

type WhatsAppProfile = { display_phone_number?: string; verified_name?: string; error?: { message?: string } };

function publicBaseUrl(request: Request) {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured && configured.startsWith("https://") && !configured.includes("your-domain.example")) return configured;
  const host = request.headers.get("x-forwarded-host");
  if (host && request.headers.get("x-forwarded-proto") === "https") return `https://${host}`;
  const url = new URL(request.url);
  return url.protocol === "https:" ? url.origin : "";
}

export async function GET(request: Request) {
  const config = getWhatsAppConfigSync();
  const baseUrl = publicBaseUrl(request);
  return Response.json({
    connected: Boolean(config),
    displayPhoneNumber: config?.displayPhoneNumber || "",
    verifiedName: config?.verifiedName || "",
    webhookUrl: baseUrl ? `${baseUrl}/api/webhooks/whatsapp` : "",
    verifyToken: config?.verifyToken || "",
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { accessToken?: string; phoneNumberId?: string; apiVersion?: string; appSecret?: string };
  const accessToken = body.accessToken?.trim();
  const phoneNumberId = body.phoneNumberId?.trim();
  const apiVersion = body.apiVersion?.trim().replace(/^\//, "");
  const appSecret = body.appSecret?.trim();
  if (!accessToken || !phoneNumberId || !apiVersion || !appSecret) {
    return Response.json({ error: "Заполните все поля WhatsApp" }, { status: 400 });
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    const profile = await response.json().catch(() => ({})) as WhatsAppProfile;
    if (!response.ok) throw new Error(profile.error?.message || "Meta не приняла данные подключения");

    const verifyToken = getWhatsAppConfigSync()?.verifyToken || randomBytes(24).toString("hex");
    await saveWhatsAppConfig({ accessToken, phoneNumberId, apiVersion, appSecret, verifyToken, displayPhoneNumber: profile.display_phone_number, verifiedName: profile.verified_name, updatedAt: new Date().toISOString() });
    const baseUrl = publicBaseUrl(request);
    return Response.json({ ok: true, connected: true, displayPhoneNumber: profile.display_phone_number || "", verifiedName: profile.verified_name || "", webhookUrl: baseUrl ? `${baseUrl}/api/webhooks/whatsapp` : "", verifyToken });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось подключить WhatsApp" }, { status: 400 });
  }
}

export async function DELETE() {
  await removeWhatsAppConfig();
  return Response.json({ ok: true });
}
