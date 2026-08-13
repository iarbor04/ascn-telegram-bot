import { readImage, removeImage } from "@/lib/uploads";

export async function GET(_request: Request, context: { params: Promise<{ fileName: string }> }) {
  try {
    const image = await readImage((await context.params).fileName);
    return new Response(new Uint8Array(image.data), { headers: { "content-type": image.type, "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return Response.json({ error: "Изображение не найдено" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ fileName: string }> }) {
  await removeImage((await context.params).fileName);
  return Response.json({ ok: true });
}
