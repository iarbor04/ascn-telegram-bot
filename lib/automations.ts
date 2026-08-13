import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { InboundMessage } from "@/lib/channels";

export type AutomationStep = {
  id: string;
  delayMinutes: number;
  message: string;
  messages: Record<string, string>;
  enabled: boolean;
  imageUrl?: string;
  buttons: Array<{ text: string; url: string }>;
};

export type Automation = {
  id: string;
  name: string;
  steps: AutomationStep[];
  enabled: boolean;
  createdAt: string;
};

type AutomationJob = {
  id: string;
  automationId: string;
  stepIndex: number;
  leadId: string;
  dueAt: string;
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
  error?: string;
};

type AutomationStore = { automations: Automation[]; jobs: AutomationJob[] };
type LegacyAutomation = Partial<Automation> & { id: string; name: string; delayMinutes?: number; message?: string; enabled?: boolean; createdAt?: string };

const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const storePath = path.join(dataDirectory, "automations.json");
let queue = Promise.resolve();

function normalizeStore(raw: { automations?: LegacyAutomation[]; jobs?: Array<Partial<AutomationJob> & Pick<AutomationJob, "id" | "automationId" | "leadId" | "dueAt" | "status">> }): AutomationStore {
  const automations = (raw.automations || []).map((automation) => ({
    id: automation.id,
    name: automation.name,
    enabled: automation.enabled ?? true,
    createdAt: automation.createdAt || new Date(0).toISOString(),
    steps: automation.steps?.length
      ? automation.steps.map((step) => {
          const messages = step.messages && typeof step.messages === "object" ? step.messages : { ru: step.message || "" };
          const message = messages.ru || Object.values(messages).find(Boolean) || step.message || "";
          return { ...step, message, messages, enabled: step.enabled ?? true, buttons: step.buttons || [] };
        })
      : [{ id: `legacy-${automation.id}-1`, delayMinutes: Number(automation.delayMinutes || 0), message: automation.message || "", messages: { ru: automation.message || "" }, enabled: true, buttons: [] }],
  }));
  const jobs = (raw.jobs || []).map((job) => ({ ...job, stepIndex: Number(job.stepIndex || 0) })) as AutomationJob[];
  return { automations, jobs };
}

async function readStore(): Promise<AutomationStore> {
  try {
    return normalizeStore(JSON.parse(await readFile(storePath, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { automations: [], jobs: [] };
  }
}

async function saveStore(store: AutomationStore) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${storePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(store, null, 2), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, storePath);
}

function mutate<T>(operation: (store: AutomationStore) => T | Promise<T>) {
  const run = queue.catch(() => undefined).then(async () => {
    const store = await readStore();
    const result = await operation(store);
    await saveStore(store);
    return result;
  });
  queue = run.then(() => undefined, () => undefined);
  return run;
}

export async function listAutomations() {
  await queue;
  return (await readStore()).automations;
}

type AutomationStepInput = { id?: string; delayMinutes: number; message: string; messages: Record<string, string>; enabled: boolean; imageUrl?: string; buttons: Array<{ text: string; url: string }> };

export function createAutomation(input: { name: string; steps: AutomationStepInput[] }) {
  return mutate((store) => {
    const automation: Automation = {
      id: crypto.randomUUID(),
      name: input.name,
      steps: input.steps.map((step) => ({ id: crypto.randomUUID(), delayMinutes: step.delayMinutes, message: step.message, messages: step.messages, enabled: step.enabled, imageUrl: step.imageUrl, buttons: step.buttons })),
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    store.automations.push(automation);
    return automation;
  });
}

export function updateAutomation(id: string, changes: Partial<Pick<Automation, "name" | "steps" | "enabled">>) {
  return mutate((store) => {
    const automation = store.automations.find((item) => item.id === id);
    if (!automation) return null;
    Object.assign(automation, changes);
    if (changes.enabled === false || changes.steps) {
      store.jobs.filter((job) => job.automationId === id && job.status === "pending").forEach((job) => { job.status = "cancelled"; });
    }
    return automation;
  });
}

export function updateAutomationStepEnabled(automationId: string, stepId: string, enabled: boolean) {
  return mutate((store) => {
    const automation = store.automations.find((item) => item.id === automationId);
    const stepIndex = automation?.steps.findIndex((step) => step.id === stepId) ?? -1;
    if (!automation || stepIndex < 0) return null;
    automation.steps[stepIndex].enabled = enabled;
    if (!enabled) {
      store.jobs.filter((job) => job.automationId === automationId && job.stepIndex === stepIndex && job.status === "pending").forEach((job) => { job.status = "cancelled"; });
    }
    return automation;
  });
}

export function deleteAutomation(id: string) {
  return mutate((store) => {
    const before = store.automations.length;
    store.automations = store.automations.filter((item) => item.id !== id);
    store.jobs = store.jobs.filter((job) => job.automationId !== id);
    return store.automations.length !== before;
  });
}

export function enrollInboundMessages(messages: InboundMessage[]) {
  return mutate((store) => {
    const enabled = store.automations.filter((automation) => automation.enabled);
    for (const message of messages) {
      const leadId = `${message.channel}:${message.externalChatId}`;
      for (const automation of enabled) {
        const existingJobs = store.jobs.filter((job) => job.automationId === automation.id && job.leadId === leadId);
        if (existingJobs.length) {
          existingJobs.filter((job) => job.status === "pending").forEach((job) => { job.status = "cancelled"; });
          continue;
        }

        let cumulativeDelay = 0;
        automation.steps.forEach((step, stepIndex) => {
          if (!step.enabled) return;
          cumulativeDelay += step.delayMinutes;
          store.jobs.push({
            id: crypto.randomUUID(),
            automationId: automation.id,
            stepIndex,
            leadId,
            dueAt: new Date(Date.now() + cumulativeDelay * 60_000).toISOString(),
            status: "pending",
          });
        });
      }
    }
  });
}

export function claimDueJobs() {
  return mutate((store) => {
    const now = new Date().toISOString();
    const jobs = store.jobs.filter((job) => job.status === "pending" && job.dueAt <= now).slice(0, 20);
    jobs.forEach((job) => { job.status = "processing"; });
    return jobs.map((job) => {
      const automation = store.automations.find((item) => item.id === job.automationId) || null;
      return { ...job, automation, step: automation?.steps[job.stepIndex] || null };
    });
  });
}

export function finishJob(id: string, error?: string) {
  return mutate((store) => {
    const job = store.jobs.find((item) => item.id === id);
    if (!job) return;
    job.status = error ? "failed" : "sent";
    job.error = error;
  });
}
