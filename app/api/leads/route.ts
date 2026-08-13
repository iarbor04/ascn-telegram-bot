import { listLeads, updateLeadStatus, type LeadStatus } from "@/lib/store";
import { getPipelineStages } from "@/lib/pipeline";

export async function GET() {
  return Response.json({ leads: await listLeads() });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null) as { id?: string; status?: LeadStatus } | null;
  const validStatuses = new Set((await getPipelineStages()).map((stage) => stage.id));
  if (!body?.id || !body.status || !validStatuses.has(body.status)) {
    return Response.json({ ok: false, error: "id and valid status are required" }, { status: 400 });
  }
  const updated = await updateLeadStatus(body.id, body.status);
  return Response.json({ ok: updated }, { status: updated ? 200 : 404 });
}
