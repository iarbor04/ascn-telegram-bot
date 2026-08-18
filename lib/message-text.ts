export function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

// Telegram and WhatsApp receive the text as HTML, so a client name with < or & must be escaped
// before it replaces the variable — otherwise the channel rejects the whole message.
export function applyTemplate(template: string, values: { firstName: string }) {
  return template.replaceAll("{{first_name}}", escapeHtml(values.firstName));
}

const attachmentLabels: Array<[string, string]> = [
  ["photo", "Фото"],
  ["image", "Фото"],
  ["voice", "Голосовое сообщение"],
  ["audio", "Аудио"],
  ["video_note", "Видеосообщение"],
  ["video", "Видео"],
  ["animation", "GIF"],
  ["document", "Документ"],
  ["sticker", "Стикер"],
  ["contact", "Контакт"],
  ["contacts", "Контакт"],
  ["location", "Геолокация"],
  ["poll", "Опрос"],
];

// A lead created from a voice message or a document must still show what arrived
// instead of an empty card in the pipeline and the inbox.
export function attachmentLabel(payload: Record<string, unknown>) {
  for (const [key, label] of attachmentLabels) {
    if (payload[key]) return label;
  }
  return "";
}
