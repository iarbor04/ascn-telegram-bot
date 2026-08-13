import { claimDueJobs, finishJob } from "@/lib/automations";
import { getChannelAdapter } from "@/lib/channels";
import { getLead, saveOutboundMessage } from "@/lib/store";

let running = false;

export async function processDueAutomations() {
  if (running) return;
  running = true;
  try {
    const jobs = await claimDueJobs();
    for (const job of jobs) {
      try {
        if (!job.automation?.enabled || !job.step?.enabled) throw new Error("Сценарий или шаг недоступен");
        const lead = await getLead(job.leadId);
        if (!lead) throw new Error("Получатель не найден");
        const channel = lead.id.split(":", 1)[0];
        const adapter = getChannelAdapter(channel);
        if (!adapter?.isConfigured()) throw new Error("Канал не подключён");
        const recipientId = lead.id.slice(channel.length + 1);
        const language = lead.language.toLowerCase().split(/[-_]/)[0];
        const template = job.step.messages[language] || job.step.messages.ru || job.step.message || Object.values(job.step.messages)[0];
        const text = template.replaceAll("{{first_name}}", lead.name.split(" ")[0] || lead.name);
        await adapter.send({ recipientId, text, imageUrl: job.step.imageUrl, buttons: job.step.buttons });
        await saveOutboundMessage(lead.id, text);
        await finishJob(job.id);
      } catch (error) {
        await finishJob(job.id, error instanceof Error ? error.message : "Ошибка отправки");
      }
    }
  } finally {
    running = false;
  }
}
