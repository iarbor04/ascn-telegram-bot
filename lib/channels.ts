import { createHmac, timingSafeEqual } from "node:crypto";

export type ChannelId = "telegram" | "whatsapp" | "avito" | "max";

export type OutboundMessage = {
  recipientId: string;
  text: string;
  imageUrl?: string;
};

export type InboundMessage = {
  channel: ChannelId;
  externalChatId: string;
  externalUserId?: string;
  text: string;
  receivedAt: string;
};

type JsonObject = Record<string, unknown>;

export type ChannelAdapter = {
  id: ChannelId;
  isConfigured: () => boolean;
  send: (message: OutboundMessage) => Promise<unknown>;
  verifyWebhook: (headers: Headers, rawBody: string, requestUrl: string) => boolean;
  parseWebhook: (payload: JsonObject) => InboundMessage[];
};

export class ChannelConfigurationError extends Error {}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new ChannelConfigurationError(`Missing environment variable: ${name}`);
  return value;
}

function secureEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Channel API request failed with HTTP ${response.status}`);
  }
  return body;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function array(value: unknown) {
  return Array.isArray(value) ? value : [];
}

const telegram: ChannelAdapter = {
  id: "telegram",
  isConfigured: () => Boolean(process.env.TELEGRAM_BOT_TOKEN),
  async send(message) {
    const token = requiredEnv("TELEGRAM_BOT_TOKEN");
    const method = message.imageUrl ? "sendPhoto" : "sendMessage";
    const payload = message.imageUrl
      ? { chat_id: message.recipientId, photo: message.imageUrl, caption: message.text, parse_mode: "HTML" }
      : { chat_id: message.recipientId, text: message.text, parse_mode: "HTML" };
    return requestJson(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  verifyWebhook(headers) {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    return Boolean(secret && secureEqual(headers.get("x-telegram-bot-api-secret-token") ?? "", secret));
  },
  parseWebhook(payload) {
    const message = object(payload.message ?? payload.edited_message);
    const chat = object(message.chat);
    const from = object(message.from);
    const chatId = String(chat.id ?? "");
    if (!chatId) return [];
    return [{ channel: "telegram", externalChatId: chatId, externalUserId: String(from.id ?? "") || undefined, text: text(message.text ?? message.caption), receivedAt: new Date(Number(message.date ?? Date.now() / 1000) * 1000).toISOString() }];
  },
};

const whatsapp: ChannelAdapter = {
  id: "whatsapp",
  isConfigured: () => Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_GRAPH_API_VERSION),
  async send(message) {
    const token = requiredEnv("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = requiredEnv("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = requiredEnv("WHATSAPP_GRAPH_API_VERSION");
    const content = message.imageUrl
      ? { type: "image", image: { link: message.imageUrl, caption: message.text } }
      : { type: "text", text: { body: message.text, preview_url: true } };
    return requestJson(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: message.recipientId, ...content }),
    });
  },
  verifyWebhook(headers, rawBody) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) return false;
    const signature = headers.get("x-hub-signature-256") ?? "";
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    return secureEqual(signature, expected);
  },
  parseWebhook(payload) {
    return array(payload.entry).flatMap((entryValue) => {
      const entry = object(entryValue);
      return array(entry.changes).flatMap((changeValue) => {
        const value = object(object(changeValue).value);
        return array(value.messages).map((messageValue) => {
          const message = object(messageValue);
          const messageText = object(message.text);
          const image = object(message.image);
          return { channel: "whatsapp" as const, externalChatId: text(message.from), externalUserId: text(message.from) || undefined, text: text(messageText.body ?? image.caption), receivedAt: new Date(Number(message.timestamp ?? Date.now() / 1000) * 1000).toISOString() };
        }).filter((message) => message.externalChatId);
      });
    });
  },
};

let avitoTokenCache: { value: string; expiresAt: number } | null = null;

async function getAvitoToken() {
  if (process.env.AVITO_ACCESS_TOKEN) return process.env.AVITO_ACCESS_TOKEN;
  if (avitoTokenCache && avitoTokenCache.expiresAt > Date.now() + 60_000) return avitoTokenCache.value;
  const clientId = requiredEnv("AVITO_CLIENT_ID");
  const clientSecret = requiredEnv("AVITO_CLIENT_SECRET");
  const response = await requestJson("https://api.avito.ru/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  }) as JsonObject;
  const value = text(response.access_token);
  if (!value) throw new Error("Avito did not return an access token");
  avitoTokenCache = { value, expiresAt: Date.now() + Number(response.expires_in ?? 3600) * 1000 };
  return value;
}

const avito: ChannelAdapter = {
  id: "avito",
  isConfigured: () => Boolean(process.env.AVITO_USER_ID && (process.env.AVITO_ACCESS_TOKEN || (process.env.AVITO_CLIENT_ID && process.env.AVITO_CLIENT_SECRET))),
  async send(message) {
    const userId = requiredEnv("AVITO_USER_ID");
    const token = await getAvitoToken();
    return requestJson(`https://api.avito.ru/messenger/v1/accounts/${encodeURIComponent(userId)}/chats/${encodeURIComponent(message.recipientId)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ type: "text", message: { text: message.text } }),
    });
  },
  verifyWebhook(_headers, _rawBody, requestUrl) {
    const secret = process.env.AVITO_WEBHOOK_SECRET;
    return Boolean(secret && secureEqual(new URL(requestUrl).searchParams.get("secret") ?? "", secret));
  },
  parseWebhook(payload) {
    const event = object(payload.payload ?? payload);
    const value = object(event.value ?? event);
    const content = object(value.content ?? value.message);
    const chatId = String(value.chat_id ?? event.chat_id ?? "");
    if (!chatId) return [];
    return [{ channel: "avito", externalChatId: chatId, externalUserId: String(value.user_id ?? value.author_id ?? "") || undefined, text: text(content.text ?? value.text), receivedAt: new Date(Number(value.created ?? value.created_at ?? Date.now() / 1000) * 1000).toISOString() }];
  },
};

const max: ChannelAdapter = {
  id: "max",
  isConfigured: () => Boolean(process.env.MAX_BOT_TOKEN),
  async send(message) {
    const token = requiredEnv("MAX_BOT_TOKEN");
    const attachments = message.imageUrl ? [{ type: "image", payload: { url: message.imageUrl } }] : undefined;
    return requestJson(`https://platform-api2.max.ru/messages?user_id=${encodeURIComponent(message.recipientId)}`, {
      method: "POST",
      headers: { authorization: token, "content-type": "application/json" },
      body: JSON.stringify({ text: message.text, format: "html", attachments, notify: true }),
    });
  },
  verifyWebhook(headers) {
    const secret = process.env.MAX_WEBHOOK_SECRET;
    return Boolean(secret && secureEqual(headers.get("x-max-bot-api-secret") ?? "", secret));
  },
  parseWebhook(payload) {
    const message = object(payload.message);
    const body = object(message.body);
    const sender = object(message.sender);
    const recipient = object(message.recipient);
    const chatId = String(recipient.chat_id ?? message.chat_id ?? sender.user_id ?? "");
    if (!chatId) return [];
    return [{ channel: "max", externalChatId: chatId, externalUserId: String(sender.user_id ?? "") || undefined, text: text(body.text ?? message.text), receivedAt: new Date(Number(message.timestamp ?? Date.now())).toISOString() }];
  },
};

const adapters: Record<ChannelId, ChannelAdapter> = { telegram, whatsapp, avito, max };

export function getChannelAdapter(channel: string) {
  return adapters[channel as ChannelId] ?? null;
}

export function verifyInternalApiKey(headers: Headers) {
  const expected = process.env.INTERNAL_API_KEY;
  return Boolean(expected && secureEqual(headers.get("x-api-key") ?? "", expected));
}
