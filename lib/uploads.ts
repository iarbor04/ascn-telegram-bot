import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDirectory = process.env.DATA_DIR?.trim() || path.join(process.cwd(), ".data");
const uploadsDirectory = path.join(dataDirectory, "uploads");
const imageTypes: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

function safeFileName(value: string) {
  if (!/^[a-f0-9-]+\.(?:jpg|png|webp|gif)$/.test(value)) throw new Error("Некорректный файл");
  return value;
}

export async function saveImage(file: File) {
  const extension = imageTypes[file.type];
  if (!extension) throw new Error("Поддерживаются JPG, PNG, WEBP и GIF");
  return saveImageBuffer(Buffer.from(await file.arrayBuffer()), extension);
}

export async function saveImageBuffer(data: Buffer, extension: string) {
  if (!Object.values(imageTypes).includes(extension)) throw new Error("Неподдерживаемый формат изображения");
  if (data.length > 10 * 1024 * 1024) throw new Error("Файл должен быть меньше 10 МБ");
  const fileName = `${crypto.randomUUID()}.${extension}`;
  await mkdir(uploadsDirectory, { recursive: true });
  await writeFile(path.join(uploadsDirectory, fileName), data, { mode: 0o600 });
  return { fileName, url: `/api/uploads/${fileName}` };
}

export async function readImage(fileName: string) {
  const safeName = safeFileName(fileName);
  const extension = safeName.split(".").pop() || "jpg";
  const types: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
  return { data: await readFile(path.join(uploadsDirectory, safeName)), type: types[extension], fileName: safeName };
}

export async function removeImage(fileName: string) {
  await unlink(path.join(uploadsDirectory, safeFileName(fileName))).catch(() => undefined);
}

export function uploadFileNameFromUrl(url: string) {
  const match = url.match(/^\/api\/uploads\/([a-f0-9-]+\.(?:jpg|png|webp|gif))$/);
  return match?.[1] || "";
}
