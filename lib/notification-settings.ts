import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InboundMessage } from "@/lib/channels";
import { getChannelAdapter } from "@/lib/channels";
import { getDailySummaryStats } from "@/lib/store";

export type NotificationSettings = {
  operatorChatIds: string[];
  summaryChatId: string;
  summaryTime: string;
  timeZone: string;
  lastSummaryDate: string;
};

const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const settingsPath = path.join(dataDirectory, "notification-settings.json");
const defaults: NotificationSettings = { operatorChatIds: [], summaryChatId: "", summaryTime: "20:00", timeZone: "Europe/Moscow", lastSummaryDate: "" };
let writeQueue = Promise.resolve();
let processingSummary = false;

function normalize(value: Partial<NotificationSettings>): NotificationSettings {
  return {
    operatorChatIds: Array.isArray(value.operatorChatIds) ? value.operatorChatIds.filter((item) => /^-?\d+$/.test(item)).slice(0, 10) : [],
    summaryChatId: /^-?\d+$/.test(value.summaryChatId || "") ? value.summaryChatId || "" : "",
    summaryTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(value.summaryTime || "") ? value.summaryTime || defaults.summaryTime : defaults.summaryTime,
    timeZone: validTimeZone(value.timeZone || "") ? value.timeZone || defaults.timeZone : defaults.timeZone,
    lastSummaryDate: /^\d{4}-\d{2}-\d{2}$/.test(value.lastSummaryDate || "") ? value.lastSummaryDate || "" : "",
  };
}

function validTimeZone(value: string) {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("ru-RU", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export async function getNotificationSettings() {
  await writeQueue;
  try {
    return normalize(JSON.parse(await readFile(settingsPath, "utf8")) as Partial<NotificationSettings>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { ...defaults };
  }
}

export async function saveNotificationSettings(input: Omit<NotificationSettings, "lastSummaryDate">) {
  const current = await getNotificationSettings();
  const settings = normalize({ ...input, lastSummaryDate: current.lastSummaryDate });
  const run = writeQueue.catch(() => undefined).then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${settingsPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(settings, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, settingsPath);
  });
  writeQueue = run.then(() => undefined, () => undefined);
  await run;
  return settings;
}

async function markSummarySent(settings: NotificationSettings, date: string) {
  const updated = { ...settings, lastSummaryDate: date };
  const run = writeQueue.catch(() => undefined).then(async () => {
    await mkdir(dataDirectory, { recursive: true });
    const temporaryPath = `${settingsPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(updated, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, settingsPath);
  });
  writeQueue = run.then(() => undefined, () => undefined);
  await run;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export async function sendOperatorNotifications(messages: InboundMessage[]) {
  if (!messages.length) return;
  const settings = await getNotificationSettings();
  if (!settings.operatorChatIds.length) return;
  const telegram = getChannelAdapter("telegram");
  if (!telegram?.isConfigured()) return;
  await Promise.allSettled(messages.flatMap((message) => settings.operatorChatIds.map((recipientId) => telegram.send({
    recipientId,
    text: [
      "🔔 <b>Новое сообщение клиента</b>",
      `Канал: ${message.channel === "telegram" ? "Telegram" : "WhatsApp"}`,
      `Клиент: ${escapeHtml(message.displayName || message.handle || message.externalChatId)}`,
      "",
      escapeHtml(message.text || "Сообщение без текста"),
    ].join("\n"),
  }))));
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export async function processDailySummary() {
  if (processingSummary) return;
  processingSummary = true;
  try {
    const settings = await getNotificationSettings();
    const recipients = settings.summaryChatId ? [settings.summaryChatId] : settings.operatorChatIds;
    const telegram = getChannelAdapter("telegram");
    if (!recipients.length || !telegram?.isConfigured()) return;
    const now = new Date();
    const current = zonedParts(now, settings.timeZone);
    if (current.time < settings.summaryTime || settings.lastSummaryDate === current.date) return;
    const stats = await getDailySummaryStats(settings.timeZone, current.date);
    const text = [
      `📊 <b>Сводка за ${current.date}</b>`,
      "",
      `Новых обращений: <b>${stats.newLeads}</b>`,
      `Входящих сообщений: <b>${stats.inboundMessages}</b>`,
      `Непрочитанных сейчас: <b>${stats.unread}</b>`,
      `Активных лидов: <b>${stats.active}</b>`,
      `Сделок всего: <b>${stats.won}</b>`,
    ].join("\n");
    const results = await Promise.allSettled(recipients.map((recipientId) => telegram.send({ recipientId, text })));
    if (results.some((result) => result.status === "fulfilled")) await markSummarySent(settings, current.date);
  } finally {
    processingSummary = false;
  }
}

export async function sendTestNotification() {
  const settings = await getNotificationSettings();
  if (!settings.operatorChatIds.length) throw new Error("Сначала укажите Telegram ID оператора");
  const telegram = getChannelAdapter("telegram");
  if (!telegram?.isConfigured()) throw new Error("Сначала подключите Telegram-бота");
  const results = await Promise.allSettled(settings.operatorChatIds.map((recipientId) => telegram.send({ recipientId, text: "✅ <b>Тестовое уведомление ASCN.AI Agent</b>\nСвязь с оператором работает." })));
  if (!results.some((result) => result.status === "fulfilled")) throw new Error("Telegram не принял уведомление. Проверьте ID и нажмите /start у бота");
}
