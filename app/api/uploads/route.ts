import { saveImage } from "@/lib/uploads";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Выберите изображение" }, { status: 400 });
  try {
    return Response.json(await saveImage(file), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось сохранить изображение" }, { status: 400 });
  }
}
