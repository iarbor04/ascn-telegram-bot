import { randomBytes } from "node:crypto";
import { getTelegramConfigSync, removeTelegramConfig, saveTelegramConfig } from "@/lib/channel-config";

type TelegramResponse = {
  ok?: boolean;
  result?: {
    id?: number;
    first_name?: string;
    username?: string;
  };
  description?: string;
};

function publicBaseUrl(request: Request) {
  const configured = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (configured && configured.startsWith("https://") && !configured.includes("your-domain.example")) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedHost && forwardedProto === "https") return `https://${forwardedHost}`;

  const url = new URL(request.url);
  return url.protocol === "https:" ? url.origin : "";
}

async function telegramRequest(token: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({})) as TelegramResponse;
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram не принял токен");
  return result;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { token?: string };
  const token = body.token?.trim();
  if (!token) return Response.json({ error: "Вставьте токен Telegram-бота" }, { status: 400 });

  try {
    const profile = await telegramRequest(token, "getMe");
    const existing = getTelegramConfigSync();
    const webhookSecret = existing?.webhookSecret || randomBytes(24).toString("hex");
    const baseUrl = publicBaseUrl(request);
    let webhookConfigured = false;

    if (baseUrl) {
      await telegramRequest(token, "setWebhook", {
        url: `${baseUrl}/api/webhooks/telegram`,
        secret_token: webhookSecret,
        allowed_updates: ["message", "edited_message"],
      });
      webhookConfigured = true;
    }

    await saveTelegramConfig({
      botToken: token,
      webhookSecret,
      botUsername: profile.result?.username,
      botName: profile.result?.first_name,
      updatedAt: new Date().toISOString(),
    });

    return Response.json({
      ok: true,
      connected: true,
      botUsername: profile.result?.username || "",
      botName: profile.result?.first_name || "Telegram-бот",
      webhookConfigured,
      webhookUrl: baseUrl ? `${baseUrl}/api/webhooks/telegram` : "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось подключить Telegram";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  const current = getTelegramConfigSync();
  if (current?.botToken) {
    await telegramRequest(current.botToken, "deleteWebhook", { drop_pending_updates: false }).catch(() => undefined);
  }
  await removeTelegramConfig();
  return Response.json({ ok: true });
}
