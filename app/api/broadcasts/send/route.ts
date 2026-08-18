import { getChannelAdapter } from "@/lib/channels";
import { applyTemplate, firstName } from "@/lib/message-text";
import { listLeads, saveOutboundMessage } from "@/lib/store";
import { getPipelineStages } from "@/lib/pipeline";

const languageMap: Record<string, string> = { ru: "ru", en: "en", es: "es", zh: "zh", ar: "ar", pt: "pt" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { drafts?: Record<string, string>; status?: string; channel?: string; imageUrl?: string; buttons?: Array<{ text?: string; url?: string }> } | null;
  if (!body?.drafts) return Response.json({ ok: false, error: "drafts are required" }, { status: 400 });
  const imageUrl = body.imageUrl?.startsWith("/api/uploads/") ? body.imageUrl : undefined;
  const buttons = (body.buttons || []).slice(0, 3).map((button) => ({ text: button.text?.trim() || "", url: button.url?.trim() || "" }));
  if (buttons.some((button) => !button.text || !/^https?:\/\//i.test(button.url))) return Response.json({ ok: false, error: "Заполните текст и ссылку каждой кнопки" }, { status: 400 });
  const stages = await getPipelineStages();
  const wonStageIds = new Set(stages.filter((stage) => stage.isWon).map((stage) => stage.id));
  const allowedStatuses = new Set(["all", ...stages.filter((stage) => !stage.isWon).map((stage) => stage.id)]);
  const allowedChannels = new Set(["all", "Telegram", "WhatsApp"]);
  const status = allowedStatuses.has(body.status || "all") ? body.status || "all" : "all";
  const channel = allowedChannels.has(body.channel || "all") ? body.channel || "all" : "all";
  const leads = (await listLeads()).filter((lead) => !wonStageIds.has(lead.status) && (status === "all" || lead.status === status) && (channel === "all" || lead.source === channel));
  if (!leads.length) return Response.json({ ok: false, error: "Нет получателей по выбранным фильтрам", sent: 0, failed: 0 }, { status: 400 });
  const results = await Promise.allSettled(leads.map(async (lead) => {
    const [channel, recipientId] = lead.id.split(":", 2);
    const adapter = getChannelAdapter(channel);
    if (!adapter?.isConfigured()) throw new Error(`${channel} is not configured`);
    const normalizedLanguage = lead.language.toLowerCase().split(/[-_]/)[0];
    const draftKey = languageMap[normalizedLanguage] || "ru";
    const message = (body.drafts?.[draftKey] || body.drafts?.ru || "").trim();
    if (!message) throw new Error(`No message for ${draftKey}`);
    const text = applyTemplate(message, { firstName: firstName(lead.name) });
    await adapter.send({ recipientId, text, imageUrl, buttons });
    await saveOutboundMessage(lead.id, text);
  }));
  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "Канал не принял сообщение"] : []);
  return Response.json({
    ok: sent === leads.length,
    sent,
    failed: leads.length - sent,
    // Without the reason a partial send looks like a success to the owner.
    error: failures.length ? [...new Set(failures)].slice(0, 3).join("; ") : undefined,
  }, { status: sent ? 200 : 502 });
}
