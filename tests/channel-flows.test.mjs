// Exercises the inbound and outbound message flows against a local stub of the
// Telegram and WhatsApp APIs, so no request leaves the machine.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

const port = 3124;
const stubPort = 3125;
const baseUrl = `http://127.0.0.1:${port}`;
const authorization = `Basic ${Buffer.from("admin:test-admin-password").toString("base64")}`;
const webhookSecret = "test-webhook-secret";
const appSecret = "test-app-secret";
const failingChatId = "999000999";

let server;
let stub;
let dataDirectory;
let stubRequests = [];

function stubServer() {
  return new Promise((resolve) => {
    stub = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch { parsed = null; }
        stubRequests.push({ url: request.url, body: parsed, raw: body });
        const rejected = parsed && String(parsed.chat_id ?? parsed.to ?? "") === failingChatId;
        response.writeHead(rejected ? 400 : 200, { "content-type": "application/json" });
        response.end(rejected
          ? JSON.stringify({ ok: false, description: "Bad Request: chat not found", error: { message: "chat not found" } })
          : JSON.stringify({ ok: true, result: { message_id: 1 }, messages: [{ id: "wamid.1" }] }));
      });
    });
    stub.listen(stubPort, "127.0.0.1", resolve);
  });
}

before(async () => {
  await stubServer();
  dataDirectory = await mkdtemp(join(tmpdir(), "ascn-flows-test-"));
  await writeFile(join(dataDirectory, "channels.json"), JSON.stringify({
    telegram: { botToken: "111:TEST", webhookSecret, botUsername: "test_bot", botName: "Test", updatedAt: new Date().toISOString() },
    whatsapp: { accessToken: "EAATEST", phoneNumberId: "1234567890", apiVersion: "v23.0", appSecret, verifyToken: "verify-token", updatedAt: new Date().toISOString() },
  }, null, 2));

  server = spawn("npm", ["start", "--", "-p", String(port)], {
    stdio: "ignore",
    env: {
      ...process.env,
      DATA_DIR: dataDirectory,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "test-admin-password",
      TELEGRAM_API_BASE: `http://127.0.0.1:${stubPort}`,
      WHATSAPP_API_BASE: `http://127.0.0.1:${stubPort}`,
    },
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { headers: { authorization } });
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Production server did not start in time");
});

after(async () => {
  server?.kill("SIGTERM");
  stub?.close();
});

function telegramUpdate(message) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    message: { message_id: 1, date: Math.floor(Date.now() / 1000), ...message },
  };
}

function postTelegram(update, secret = webhookSecret) {
  return fetch(`${baseUrl}/api/webhooks/telegram`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify(update),
  });
}

async function postWhatsApp(payload, secret = appSecret) {
  const raw = JSON.stringify(payload);
  return fetch(`${baseUrl}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}` },
    body: raw,
  });
}

function listLeads() {
  return fetch(`${baseUrl}/api/leads`, { headers: { authorization } }).then((response) => response.json()).then((data) => data.leads);
}

test("rejects a Telegram webhook signed with the wrong secret", async () => {
  const response = await postTelegram(telegramUpdate({ chat: { id: 1 }, from: { id: 1, first_name: "Кто-то" }, text: "Привет" }), "wrong-secret");
  assert.equal(response.status, 401);
});

test("stores a Telegram lead with profile name, handle and language", async () => {
  const response = await postTelegram(telegramUpdate({
    chat: { id: 555000111 },
    from: { id: 555000111, first_name: "Иван", last_name: "Петров", username: "ivan_test", language_code: "ru-RU" },
    text: "Интересует тариф",
  }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, accepted: 1 });

  const lead = (await listLeads()).find((item) => item.id === "telegram:555000111");
  assert.equal(lead.name, "Иван Петров");
  assert.equal(lead.handle, "@ivan_test");
  assert.equal(lead.language, "ru-RU");
  assert.equal(lead.message, "Интересует тариф");
});

test("labels a Telegram message that carries no text", async () => {
  await postTelegram(telegramUpdate({ chat: { id: 555000222 }, from: { id: 555000222, first_name: "Голос" }, voice: { file_id: "voice-1", duration: 4 } }));
  await postTelegram(telegramUpdate({ chat: { id: 555000333 }, from: { id: 555000333, first_name: "Файл" }, document: { file_id: "doc-1", file_name: "smeta.pdf" } }));

  const leads = await listLeads();
  assert.equal(leads.find((item) => item.id === "telegram:555000222").message, "Голосовое сообщение");
  assert.equal(leads.find((item) => item.id === "telegram:555000333").message, "Документ");
});

test("ignores an update that has no message", async () => {
  const response = await postTelegram({ update_id: 7, callback_query: { id: "1", data: "open" } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, accepted: 0 });
});

test("rejects a WhatsApp webhook with an invalid signature", async () => {
  const response = await postWhatsApp({ entry: [] }, "other-secret");
  assert.equal(response.status, 401);
});

test("stores a WhatsApp lead with the contact profile name", async () => {
  const response = await postWhatsApp({
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: "79990001122", profile: { name: "Мария Кузнецова" } }],
          messages: [{ from: "79990001122", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: "Здравствуйте" } }],
        },
      }],
    }],
  });
  assert.equal(response.status, 200);

  const lead = (await listLeads()).find((item) => item.id === "whatsapp:79990001122");
  assert.equal(lead.name, "Мария Кузнецова");
  assert.equal(lead.handle, "+79990001122");
  assert.equal(lead.source, "WhatsApp");
  assert.equal(lead.message, "Здравствуйте");
});

test("labels a WhatsApp image sent without a caption", async () => {
  await postWhatsApp({
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: "79990003344", profile: { name: "Пётр" } }],
          messages: [{ from: "79990003344", timestamp: String(Math.floor(Date.now() / 1000)), type: "image", image: { id: "media-1", mime_type: "image/jpeg" } }],
        },
      }],
    }],
  });
  assert.equal((await listLeads()).find((item) => item.id === "whatsapp:79990003344").message, "Фото");
});

test("sends an operator reply and stores it in the dialog", async () => {
  stubRequests = [];
  const response = await fetch(`${baseUrl}/api/messages/reply`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ leadId: "telegram:555000111", text: "Отвечаем по тарифу" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message.direction, "outbound");

  const sent = stubRequests.find((item) => item.url.includes("sendMessage"));
  assert.equal(sent.body.chat_id, "555000111");
  assert.equal(sent.body.text, "Отвечаем по тарифу");

  const messages = await fetch(`${baseUrl}/api/leads/${encodeURIComponent("telegram:555000111")}/messages`, { headers: { authorization } }).then((r) => r.json());
  assert.ok(messages.messages.some((item) => item.direction === "outbound" && item.text === "Отвечаем по тарифу"));
});

test("reports the channel error instead of failing with an empty 500", async () => {
  await postTelegram(telegramUpdate({ chat: { id: Number(failingChatId) }, from: { id: Number(failingChatId), first_name: "Недоступный" }, text: "Привет" }));
  const response = await fetch(`${baseUrl}/api/messages/reply`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ leadId: `telegram:${failingChatId}`, text: "Ответ" }),
  });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /chat not found/);
});

test("escapes the client name substituted into a broadcast", async () => {
  await postTelegram(telegramUpdate({ chat: { id: 555000444 }, from: { id: 555000444, first_name: "<b>Ольга", language_code: "ru" }, text: "Здравствуйте" }));
  stubRequests = [];
  const response = await fetch(`${baseUrl}/api/broadcasts/send`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ drafts: { ru: "Привет, {{first_name}}!" }, channel: "Telegram" }),
  });
  assert.equal(response.status, 200);

  const sent = stubRequests.filter((item) => item.url.includes("sendMessage")).map((item) => item.body.text);
  assert.ok(sent.includes("Привет, &lt;b&gt;Ольга!"), `unexpected outbound texts: ${JSON.stringify(sent)}`);
});

test("reports how many broadcast messages the channel refused", async () => {
  const response = await fetch(`${baseUrl}/api/broadcasts/send`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ drafts: { ru: "Общая рассылка" }, channel: "Telegram" }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.ok(result.failed >= 1, `expected at least one refused recipient: ${JSON.stringify(result)}`);
  assert.match(result.error, /chat not found/);
});

test("recovers an automation job stranded in processing by a restart", async () => {
  const automationsPath = join(dataDirectory, "automations.json");
  const store = JSON.parse(await readFile(automationsPath, "utf8").catch(() => '{"automations":[],"jobs":[]}'));
  store.automations.push({
    id: "recovery-automation",
    name: "Восстановление",
    enabled: true,
    createdAt: new Date().toISOString(),
    steps: [{ id: "recovery-step", delayMinutes: 0, message: "Первое сообщение", messages: { ru: "Первое сообщение" }, enabled: true, buttons: [] }],
  });
  store.jobs.push({
    id: "stranded-job",
    automationId: "recovery-automation",
    stepIndex: 0,
    leadId: "telegram:555000111",
    dueAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    claimedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    status: "processing",
    attempts: 1,
  });
  await writeFile(automationsPath, JSON.stringify(store, null, 2));

  // The webhook triggers the runner, which re-claims jobs left behind by a restart.
  await postTelegram(telegramUpdate({ chat: { id: 555000111 }, from: { id: 555000111, first_name: "Иван" }, text: "ещё сообщение" }));

  let job = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const current = JSON.parse(await readFile(automationsPath, "utf8"));
    job = current.jobs.find((item) => item.id === "stranded-job");
    if (job && job.status !== "processing") break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.equal(job.status, "sent", `job did not complete: ${JSON.stringify(job)}`);
});
