import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type PipelineStage = {
  id: string;
  title: string;
  color: "blue" | "violet" | "amber" | "green" | "red" | "cyan" | "pink" | "gray";
  isWon: boolean;
};

export const defaultPipelineStages: PipelineStage[] = [
  { id: "new", title: "Новые", color: "blue", isWon: false },
  { id: "qualified", title: "Квалификация", color: "violet", isWon: false },
  { id: "dialogue", title: "В диалоге", color: "amber", isWon: false },
  { id: "won", title: "Сделка", color: "green", isWon: true },
];

const allowedColors = new Set<PipelineStage["color"]>(["blue", "violet", "amber", "green", "red", "cyan", "pink", "gray"]);
const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const pipelinePath = path.join(dataDirectory, "pipeline.json");
let queue = Promise.resolve();

function normalizeStages(value: unknown): PipelineStage[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) return null;
  const seen = new Set<string>();
  const stages: PipelineStage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const source = item as Partial<PipelineStage>;
    const id = typeof source.id === "string" ? source.id.trim() : "";
    const title = typeof source.title === "string" ? source.title.trim() : "";
    if (!/^[a-z0-9-]{1,64}$/i.test(id) || seen.has(id) || !title || title.length > 40 || !allowedColors.has(source.color as PipelineStage["color"])) return null;
    seen.add(id);
    stages.push({ id, title, color: source.color as PipelineStage["color"], isWon: source.isWon === true });
  }
  if (stages.filter((stage) => stage.isWon).length !== 1) return null;
  return stages;
}

async function readStages() {
  try {
    const parsed = JSON.parse(await readFile(pipelinePath, "utf8")) as { stages?: unknown };
    return normalizeStages(parsed.stages) || defaultPipelineStages.map((stage) => ({ ...stage }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return defaultPipelineStages.map((stage) => ({ ...stage }));
  }
}

async function writeStages(stages: PipelineStage[]) {
  await mkdir(dataDirectory, { recursive: true });
  const temporaryPath = `${pipelinePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify({ stages }, null, 2), "utf8");
  await rename(temporaryPath, pipelinePath);
}

export async function getPipelineStages() {
  await queue;
  return readStages();
}

export function savePipelineStages(value: unknown) {
  const stages = normalizeStages(value);
  if (!stages) throw new Error("Укажите от 1 до 8 уникальных этапов и выберите один финальный этап");
  queue = queue.then(() => writeStages(stages));
  return queue.then(() => stages.map((stage) => ({ ...stage })));
}
