import { getNotificationSettings, saveNotificationSettings, sendTestNotification } from "@/lib/notification-settings";

function parseIds(value: unknown) {
  const ids = (typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : "").split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  if (ids.length > 10 || ids.some((item) => !/^-?\d+$/.test(item))) throw new Error("Укажите до 10 Telegram ID через запятую");
  return [...new Set(ids)];
}

export async function GET() {
  const settings = await getNotificationSettings();
  return Response.json({ ...settings, operatorChatIds: settings.operatorChatIds.join(", ") });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({})) as { operatorChatIds?: unknown; summaryChatId?: unknown; summaryTime?: unknown; timeZone?: unknown };
  try {
    const operatorChatIds = parseIds(body.operatorChatIds);
    const summaryChatId = typeof body.summaryChatId === "string" ? body.summaryChatId.trim() : "";
    const summaryTime = typeof body.summaryTime === "string" ? body.summaryTime : "";
    const timeZone = typeof body.timeZone === "string" ? body.timeZone : "";
    if (summaryChatId && !/^-?\d+$/.test(summaryChatId)) throw new Error("Некорректный ID чата для сводки");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(summaryTime)) throw new Error("Укажите время сводки");
    try { new Intl.DateTimeFormat("ru-RU", { timeZone }).format(); } catch { throw new Error("Некорректный часовой пояс"); }
    const settings = await saveNotificationSettings({ operatorChatIds, summaryChatId, summaryTime, timeZone });
    return Response.json({ ...settings, operatorChatIds: settings.operatorChatIds.join(", ") });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить настройки" }, { status: 400 });
  }
}

export async function POST() {
  try {
    await sendTestNotification();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось отправить тест" }, { status: 400 });
  }
}
