import { createHmac, timingSafeEqual } from "node:crypto";
import { getTelegramConfigSync, getWhatsAppConfigSync } from "@/lib/channel-config";
import { readImage, saveImageBuffer, uploadFileNameFromUrl } from "@/lib/uploads";

export type ChannelId = "telegram" | "whatsapp";

export type OutboundMessage = {
  recipientId: string;
  text: string;
  imageUrl?: string;
  buttons?: Array<{ text: string; url: string }>;
};

export type InboundMessage = {
  channel: ChannelId;
  externalChatId: string;
  externalUserId?: string;
  text: string;
  imageUrl?: string;
  receivedAt: string;
  displayName?: string;
  handle?: string;
  language?: string;
};

type JsonObject = Record<string, unknown>;

export type ChannelAdapter = {
  id: ChannelId;
  isConfigured: () => boolean;
  send: (message: OutboundMessage) => Promise<unknown>;
  verifyWebhook: (headers: Headers, rawBody: string, requestUrl: string) => boolean;
  parseWebhook: (payload: JsonObject) => InboundMessage[] | Promise<InboundMessage[]>;
};

export class ChannelConfigurationError extends Error {}

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

function whatsappText(value: string) {
  return value
    .replace(/<b>([\s\S]*?)<\/b>/gi, "*$1*")
    .replace(/<strong>([\s\S]*?)<\/strong>/gi, "*$1*")
    .replace(/<i>([\s\S]*?)<\/i>/gi, "_$1_")
    .replace(/<em>([\s\S]*?)<\/em>/gi, "_$1_")
    .replace(/<u>([\s\S]*?)<\/u>/gi, "$1")
    .replace(/<a\s+href=["']([^"']+)["']>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<[^>]+>/g, "");
}

const telegram: ChannelAdapter = {
  id: "telegram",
  isConfigured: () => Boolean(getTelegramConfigSync()?.botToken),
  async send(message) {
    const token = getTelegramConfigSync()?.botToken;
    if (!token) throw new ChannelConfigurationError("Telegram-бот не подключён");
    const method = message.imageUrl ? "sendPhoto" : "sendMessage";
    const replyMarkup = message.buttons?.length ? { inline_keyboard: message.buttons.map((button) => [{ text: button.text, url: button.url }]) } : undefined;
    const localFileName = message.imageUrl ? uploadFileNameFromUrl(message.imageUrl) : "";
    if (localFileName) {
      const image = await readImage(localFileName);
      const formData = new FormData();
      formData.set("chat_id", message.recipientId);
      formData.set("caption", message.text);
      formData.set("parse_mode", "HTML");
      if (replyMarkup) formData.set("reply_markup", JSON.stringify(replyMarkup));
      formData.set("photo", new Blob([new Uint8Array(image.data)], { type: image.type }), image.fileName);
      return requestJson(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: formData });
    }
    const payload = message.imageUrl
      ? { chat_id: message.recipientId, photo: message.imageUrl, caption: message.text, parse_mode: "HTML", reply_markup: replyMarkup }
      : { chat_id: message.recipientId, text: message.text, parse_mode: "HTML", reply_markup: replyMarkup };
    return requestJson(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  verifyWebhook(headers) {
    const secret = getTelegramConfigSync()?.webhookSecret;
    return Boolean(secret && secureEqual(headers.get("x-telegram-bot-api-secret-token") ?? "", secret));
  },
  async parseWebhook(payload) {
    const message = object(payload.message ?? payload.edited_message);
    const chat = object(message.chat);
    const from = object(message.from);
    const chatId = String(chat.id ?? "");
    if (!chatId) return [];
    const photos = array(message.photo).map(object);
    const largestPhoto = photos[photos.length - 1];
    let imageUrl = "";
    const fileId = text(largestPhoto?.file_id);
    if (fileId) {
      try {
        const config = getTelegramConfigSync();
        const fileInfo = await requestJson(`https://api.telegram.org/bot${config?.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`, { method: "GET" }) as JsonObject;
        const filePath = text(object(fileInfo.result).file_path);
        if (filePath) {
          const imageResponse = await fetch(`https://api.telegram.org/file/bot${config?.botToken}/${filePath}`, { signal: AbortSignal.timeout(15_000) });
          if (imageResponse.ok) {
            const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
            const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
            imageUrl = (await saveImageBuffer(Buffer.from(await imageResponse.arrayBuffer()), extension)).url;
          }
        }
      } catch {
        imageUrl = "";
      }
    }
    const firstName = text(from.first_name);
    const lastName = text(from.last_name);
    const username = text(from.username);
    return [{ channel: "telegram", externalChatId: chatId, externalUserId: String(from.id ?? "") || undefined, text: text(message.text ?? message.caption) || (imageUrl ? "Фото" : ""), imageUrl: imageUrl || undefined, receivedAt: new Date(Number(message.date ?? Date.now() / 1000) * 1000).toISOString(), displayName: [firstName, lastName].filter(Boolean).join(" ") || username || undefined, handle: username ? `@${username}` : undefined, language: text(from.language_code) || undefined }];
  },
};

const whatsapp: ChannelAdapter = {
  id: "whatsapp",
  isConfigured: () => Boolean(getWhatsAppConfigSync()?.accessToken && getWhatsAppConfigSync()?.phoneNumberId),
  async send(message) {
    const config = getWhatsAppConfigSync();
    if (!config) throw new ChannelConfigurationError("WhatsApp не подключён");
    const token = config.accessToken;
    const phoneNumberId = config.phoneNumberId;
    const apiVersion = config.apiVersion;
    const buttonLinks = message.buttons?.map((button) => `${button.text}: ${button.url}`).join("\n");
    const outboundText = whatsappText([message.text, buttonLinks].filter(Boolean).join("\n\n"));
    const localFileName = message.imageUrl ? uploadFileNameFromUrl(message.imageUrl) : "";
    let imageId = "";
    if (localFileName) {
      const image = await readImage(localFileName);
      const formData = new FormData();
      formData.set("messaging_product", "whatsapp");
      formData.set("type", image.type);
      formData.set("file", new Blob([new Uint8Array(image.data)], { type: image.type }), image.fileName);
      const uploaded = await requestJson(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: formData }) as JsonObject;
      imageId = text(uploaded.id);
    }
    const content = message.imageUrl
      ? { type: "image", image: imageId ? { id: imageId, caption: outboundText } : { link: message.imageUrl, caption: outboundText } }
      : { type: "text", text: { body: outboundText, preview_url: true } };
    return requestJson(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: message.recipientId, ...content }),
    });
  },
  verifyWebhook(headers, rawBody) {
    const secret = getWhatsAppConfigSync()?.appSecret;
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

const adapters: Record<ChannelId, ChannelAdapter> = { telegram, whatsapp };

export function getChannelAdapter(channel: string) {
  return adapters[channel as ChannelId] ?? null;
}

export function verifyInternalApiKey(headers: Headers) {
  const expected = process.env.INTERNAL_API_KEY;
  return Boolean(expected && secureEqual(headers.get("x-api-key") ?? "", expected));
}
