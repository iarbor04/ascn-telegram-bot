import { getChannelAdapter } from "@/lib/channels";
import { getTelegramConfigSync } from "@/lib/channel-config";
import { getWhatsAppConfigSync } from "@/lib/channel-config";

export async function GET() {
  const telegram = getTelegramConfigSync();
  const whatsapp = getWhatsAppConfigSync();
  return Response.json({
    telegram: Boolean(getChannelAdapter("telegram")?.isConfigured()),
    telegramBotUsername: telegram?.botUsername || "",
    telegramBotName: telegram?.botName || "",
    whatsapp: Boolean(getChannelAdapter("whatsapp")?.isConfigured()),
    whatsappPhoneNumber: whatsapp?.displayPhoneNumber || "",
    whatsappVerifiedName: whatsapp?.verifiedName || "",
  });
}
