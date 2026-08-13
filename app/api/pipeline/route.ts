import { getPipelineStages, savePipelineStages } from "@/lib/pipeline";
import { migrateLeadStages } from "@/lib/store";

export async function GET() {
  return Response.json({ stages: await getPipelineStages() });
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => null) as { stages?: unknown } | null;
  try {
    const stages = await savePipelineStages(body?.stages);
    const moved = await migrateLeadStages(new Set(stages.map((stage) => stage.id)), stages[0].id);
    return Response.json({ stages, moved });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить воронку" }, { status: 400 });
  }
}
