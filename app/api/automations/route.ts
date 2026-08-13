import { createAutomation, deleteAutomation, listAutomations, updateAutomation, updateAutomationStepEnabled } from "@/lib/automations";

type StepBody = { id?: string; delayMinutes?: number; message?: string; messages?: Record<string, string>; enabled?: boolean; imageUrl?: string; buttons?: Array<{ text?: string; url?: string }> };

function parseAutomation(body: { name?: string; steps?: StepBody[] }) {
  const name = body.name?.trim();
  const steps = (body.steps || []).map((step) => {
    const messages = Object.fromEntries(Object.entries(step.messages || { ru: step.message || "" }).map(([language, message]) => [language, typeof message === "string" ? message.trim() : ""]).filter(([, message]) => message));
    const message = messages.ru || Object.values(messages)[0] || "";
    return {
      id: step.id,
      delayMinutes: Number(step.delayMinutes),
      message,
      messages,
      enabled: step.enabled ?? true,
      imageUrl: step.imageUrl?.startsWith("/api/uploads/") ? step.imageUrl : undefined,
      buttons: (step.buttons || []).slice(0, 3).map((button) => ({ text: button.text?.trim() || "", url: button.url?.trim() || "" })),
    };
  });
  const invalidButton = steps.some((step) => step.buttons.some((button) => !button.text || !/^https?:\/\//i.test(button.url)));
  if (!name || !steps.length || invalidButton || steps.some((step) => !step.message || !Number.isFinite(step.delayMinutes) || step.delayMinutes < 0)) return null;
  return { name, steps };
}

export async function GET() {
  return Response.json({ automations: await listAutomations() });
}

export async function POST(request: Request) {
  const parsed = parseAutomation(await request.json().catch(() => ({})) as { name?: string; steps?: StepBody[] });
  if (!parsed) {
    return Response.json({ error: "Заполните название, задержку и текст каждого сообщения" }, { status: 400 });
  }
  return Response.json({ automation: await createAutomation(parsed) }, { status: 201 });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({})) as { id?: string; name?: string; steps?: StepBody[] };
  const parsed = parseAutomation(body);
  if (!body.id || !parsed) return Response.json({ error: "Заполните название, задержку и текст каждого сообщения" }, { status: 400 });
  const automation = await updateAutomation(body.id, { name: parsed.name, steps: parsed.steps.map((step) => ({ ...step, id: step.id || crypto.randomUUID() })) });
  return automation ? Response.json({ automation }) : Response.json({ error: "Сценарий не найден" }, { status: 404 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({})) as { id?: string; enabled?: boolean; stepId?: string; stepEnabled?: boolean };
  if (!body.id) return Response.json({ error: "Некорректные данные" }, { status: 400 });
  const automation = body.stepId && typeof body.stepEnabled === "boolean"
    ? await updateAutomationStepEnabled(body.id, body.stepId, body.stepEnabled)
    : typeof body.enabled === "boolean" ? await updateAutomation(body.id, { enabled: body.enabled }) : null;
  return automation ? Response.json({ automation }) : Response.json({ error: "Сценарий не найден" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Не указан сценарий" }, { status: 400 });
  return (await deleteAutomation(id)) ? Response.json({ ok: true }) : Response.json({ error: "Сценарий не найден" }, { status: 404 });
}
