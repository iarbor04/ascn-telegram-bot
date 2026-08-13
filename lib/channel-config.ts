import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

export type TelegramConfig = {
  botToken: string;
  webhookSecret: string;
  botUsername?: string;
  botName?: string;
  updatedAt: string;
};

export type WhatsAppConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
  appSecret: string;
  verifyToken: string;
  displayPhoneNumber?: string;
  verifiedName?: string;
  updatedAt: string;
};

type ChannelConfig = {
  telegram?: TelegramConfig;
  whatsapp?: WhatsAppConfig;
};

const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const configPath = path.join(dataDirectory, "channels.json");

function parseConfig(value: string): ChannelConfig {
  try {
    return JSON.parse(value) as ChannelConfig;
  } catch {
    return {};
  }
}

export function getTelegramConfigSync(): TelegramConfig | null {
  try {
    const stored = parseConfig(readFileSync(configPath, "utf8")).telegram;
    if (stored?.botToken) return stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) return null;
  return {
    botToken,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "",
    updatedAt: "",
  };
}

async function readConfig(): Promise<ChannelConfig> {
  try {
    return parseConfig(await readFile(configPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return {};
  }
}

async function writeConfig(config: ChannelConfig) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${configPath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, configPath);
}

export async function saveTelegramConfig(telegram: TelegramConfig) {
  const config = await readConfig();
  config.telegram = telegram;
  await writeConfig(config);
}

export async function removeTelegramConfig() {
  const config = await readConfig();
  delete config.telegram;
  await writeConfig(config);
}

export function getWhatsAppConfigSync(): WhatsAppConfig | null {
  try {
    const stored = parseConfig(readFileSync(configPath, "utf8")).whatsapp;
    if (stored?.accessToken && stored.phoneNumberId) return stored;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion = process.env.WHATSAPP_GRAPH_API_VERSION?.trim();
  if (!accessToken || !phoneNumberId || !apiVersion) return null;
  return {
    accessToken,
    phoneNumberId,
    apiVersion,
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "",
    updatedAt: "",
  };
}

export async function saveWhatsAppConfig(whatsapp: WhatsAppConfig) {
  const config = await readConfig();
  config.whatsapp = whatsapp;
  await writeConfig(config);
}

export async function removeWhatsAppConfig() {
  const config = await readConfig();
  delete config.whatsapp;
  await writeConfig(config);
}
