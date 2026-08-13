import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InboundMessage } from "@/lib/channels";
import { getPipelineStages } from "@/lib/pipeline";

export type LeadStatus = string;

export type StoredLead = {
  id: string;
  name: string;
  handle: string;
  language: string;
  source: "Telegram" | "WhatsApp";
  status: LeadStatus;
  message: string;
  updatedAt: string;
  unread: number;
};

export type StoredMessage = {
  id: string;
  leadId: string;
  direction: "inbound" | "outbound";
  text: string;
  createdAt: string;
};

type Store = { leads: StoredLead[]; messages: StoredMessage[] };

const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const storePath = path.join(dataDirectory, "store.json");
let writeQueue = Promise.resolve();

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(storePath, "utf8")) as Store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { leads: [], messages: [] };
  }
}

async function saveStore(store: Store) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), "utf8");
  await rename(temporaryPath, storePath);
}

function mutate<T>(operation: (store: Store) => T | Promise<T>) {
  let result: T;
  writeQueue = writeQueue.then(async () => {
    const store = await readStore();
    result = await operation(store);
    await saveStore(store);
  });
  return writeQueue.then(() => result!);
}

function sourceName(channel: InboundMessage["channel"]): StoredLead["source"] {
  const names: Record<InboundMessage["channel"], StoredLead["source"]> = { telegram: "Telegram", whatsapp: "WhatsApp" };
  return names[channel];
}

export async function listLeads() {
  await writeQueue;
  const store = await readStore();
  return [...store.leads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listMessages(leadId: string) {
  await writeQueue;
  const store = await readStore();
  return store.messages.filter((message) => message.leadId === leadId);
}

export async function getLead(id: string) {
  await writeQueue;
  const store = await readStore();
  return store.leads.find((lead) => lead.id === id) ?? null;
}

function dateInTimeZone(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export async function getDailySummaryStats(timeZone: string, date: string) {
  const stages = await getPipelineStages();
  const wonStageIds = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.id));
  await writeQueue;
  const store = await readStore();
  const todayInbound = store.messages.filter((message) => message.direction === "inbound" && dateInTimeZone(message.createdAt, timeZone) === date);
  return {
    newLeads: new Set(todayInbound.map((message) => message.leadId)).size,
    inboundMessages: todayInbound.length,
    unread: store.leads.reduce((sum, lead) => sum + lead.unread, 0),
    active: store.leads.filter((lead) => !wonStageIds.has(lead.status)).length,
    won: store.leads.filter((lead) => wonStageIds.has(lead.status)).length,
  };
}

export async function saveInboundMessages(messages: InboundMessage[]) {
  const stages = await getPipelineStages();
  const firstStageId = stages[0]?.id || "new";
  return mutate((store) => {
    for (const message of messages) {
      const leadId = `${message.channel}:${message.externalChatId}`;
      const existing = store.leads.find((lead) => lead.id === leadId);
      const now = message.receivedAt || new Date().toISOString();
      if (existing) {
        existing.message = message.text;
        existing.updatedAt = now;
        existing.unread += 1;
      } else {
        store.leads.push({
          id: leadId,
          name: message.displayName || `Новый контакт ${message.externalChatId}`,
          handle: message.handle || message.externalChatId,
          language: message.language || "Не определён",
          source: sourceName(message.channel),
          status: firstStageId,
          message: message.text,
          updatedAt: now,
          unread: 1,
        });
      }
      store.messages.push({ id: crypto.randomUUID(), leadId, direction: "inbound", text: message.text, createdAt: now });
    }
    return messages.length;
  });
}

export function updateLeadStatus(id: string, status: LeadStatus) {
  return mutate((store) => {
    const lead = store.leads.find((item) => item.id === id);
    if (!lead) return false;
    lead.status = status;
    return true;
  });
}

export function migrateLeadStages(validStageIds: Set<string>, fallbackStageId: string) {
  return mutate((store) => {
    let moved = 0;
    for (const lead of store.leads) {
      if (!validStageIds.has(lead.status)) {
        lead.status = fallbackStageId;
        moved += 1;
      }
    }
    return moved;
  });
}

export function markLeadRead(id: string) {
  return mutate((store) => {
    const lead = store.leads.find((item) => item.id === id);
    if (!lead) return false;
    lead.unread = 0;
    return true;
  });
}

export function saveOutboundMessage(leadId: string, text: string) {
  return mutate((store) => {
    const createdAt = new Date().toISOString();
    const message: StoredMessage = { id: crypto.randomUUID(), leadId, direction: "outbound", text, createdAt };
    store.messages.push(message);
    const lead = store.leads.find((item) => item.id === leadId);
    if (lead) {
      lead.message = text;
      lead.updatedAt = createdAt;
    }
    return message;
  });
}
