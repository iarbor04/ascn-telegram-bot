import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

const port = 3123;
const baseUrl = `http://127.0.0.1:${port}`;
const authorization = `Basic ${Buffer.from("admin:test-admin-password").toString("base64")}`;
let server;
let dataDirectory;

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "ascn-broadcast-test-"));
  server = spawn("npm", ["start", "--", "-p", String(port)], {
    stdio: "ignore",
    env: {
      ...process.env,
      INTERNAL_API_KEY: "test-internal-key",
      DATA_DIR: dataDirectory,
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD: "test-admin-password",
    },
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl, { headers: { authorization } });
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Production server did not start in time");
});

after(async () => {
  server?.kill("SIGTERM");
  await rm(dataDirectory, { recursive: true, force: true });
});

test("server-renders the ASCN broadcast dashboard", async () => {
  const response = await fetch(baseUrl, { headers: { authorization } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Воронка лидов/);
  assert.match(html, /Рассылки/);
  assert.match(html, /Telegram/);
  assert.match(html, /WhatsApp/);
  assert.match(html, /Новый проект/);
  assert.doesNotMatch(html, /Алексей Орлов|Sophia Clark|42 получателя|1 248/);
});

test("protects the dashboard with admin authentication", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 401);
  assert.match(response.headers.get("www-authenticate") ?? "", /Basic/);
});

test("serves the Telegram and WhatsApp brand assets", async () => {
  const [telegramLogo, whatsappLogo] = await Promise.all([
    fetch(`${baseUrl}/telegram-logo.svg`),
    fetch(`${baseUrl}/whatsapp-logo.svg`),
  ]);
  assert.equal(telegramLogo.status, 200);
  assert.equal(whatsappLogo.status, 200);
  assert.match(telegramLogo.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.match(whatsappLogo.headers.get("content-type") ?? "", /image\/svg\+xml/);
});

test("ships product metadata without the starter marker", async () => {
  const response = await fetch(baseUrl, { headers: { authorization } });
  const html = await response.text();
  assert.match(html, /ASCN\.AI Agent/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("does not warn about an open dashboard when a password is set", async () => {
  const response = await fetch(baseUrl, { headers: { authorization } });
  assert.doesNotMatch(await response.text(), /Кабинет открыт без пароля/);
});

test("rejects unsupported channel webhooks", async () => {
  const response = await fetch(`${baseUrl}/api/webhooks/unsupported`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "Тест" }),
  });
  assert.equal(response.status, 404);
});

test("reports channel configuration without exposing secrets", async () => {
  const response = await fetch(`${baseUrl}/api/channels/status`, { headers: { authorization } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { adminProtected: true, telegram: false, telegramBotUsername: "", telegramBotName: "", whatsapp: false, whatsappPhoneNumber: "", whatsappVerifiedName: "" });
});

test("saves multi-step automation sequences", async () => {
  const createResponse = await fetch(`${baseUrl}/api/automations`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Три сообщения",
      steps: [
        { delayMinutes: 5, messages: { ru: "Первое", en: "First" }, enabled: true, buttons: [{ text: "Открыть ASCN", url: "https://ascn.ai/agents" }] },
        { delayMinutes: 10, message: "Второе" },
        { delayMinutes: 15, message: "Третье" },
      ],
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()).automation;
  assert.equal(created.steps.length, 3);

  const listResponse = await fetch(`${baseUrl}/api/automations`, { headers: { authorization } });
  assert.equal(listResponse.status, 200);
  const listed = (await listResponse.json()).automations.find((item) => item.id === created.id);
  assert.deepEqual(listed.steps.map((step) => step.message), ["Первое", "Второе", "Третье"]);
  assert.equal(listed.steps[0].messages.en, "First");
  assert.deepEqual(listed.steps[0].buttons, [{ text: "Открыть ASCN", url: "https://ascn.ai/agents" }]);

  const stepToggleResponse = await fetch(`${baseUrl}/api/automations`, {
    method: "PATCH",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ id: created.id, stepId: created.steps[0].id, stepEnabled: false }),
  });
  assert.equal(stepToggleResponse.status, 200);
  const toggled = (await stepToggleResponse.json()).automation;
  assert.equal(toggled.steps[0].enabled, false);

  const updateResponse = await fetch(`${baseUrl}/api/automations`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({
      id: created.id,
      name: "Обновлённая цепочка",
      steps: toggled.steps.map((step, index) => ({ ...step, messages: index === 0 ? { ru: "Новое первое", en: "New first" } : step.messages })),
    }),
  });
  assert.equal(updateResponse.status, 200);
  const updated = (await updateResponse.json()).automation;
  assert.equal(updated.name, "Обновлённая цепочка");
  assert.equal(updated.steps[0].messages.en, "New first");
  assert.equal(updated.steps[0].enabled, false);

  const deleteResponse = await fetch(`${baseUrl}/api/automations?id=${encodeURIComponent(created.id)}`, { method: "DELETE", headers: { authorization } });
  assert.equal(deleteResponse.status, 200);
});

test("uploads and serves automation images", async () => {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zr9sAAAAASUVORK5CYII=", "base64");
  const formData = new FormData();
  formData.set("file", new File([png], "message.png", { type: "image/png" }));

  const uploadResponse = await fetch(`${baseUrl}/api/uploads`, { method: "POST", headers: { authorization }, body: formData });
  assert.equal(uploadResponse.status, 201);
  const uploaded = await uploadResponse.json();
  assert.match(uploaded.url, /^\/api\/uploads\/[a-f0-9-]+\.png$/);

  const imageResponse = await fetch(`${baseUrl}${uploaded.url}`);
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers.get("content-type") ?? "", /image\/png/);
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), png);

  const deleteResponse = await fetch(`${baseUrl}${uploaded.url}`, { method: "DELETE", headers: { authorization } });
  assert.equal(deleteResponse.status, 200);
  assert.equal((await fetch(`${baseUrl}${uploaded.url}`)).status, 404);
});

test("validates CTA buttons before sending a broadcast", async () => {
  const response = await fetch(`${baseUrl}/api/broadcasts/send`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ drafts: { ru: "Тест" }, buttons: [{ text: "Открыть", url: "not-a-url" }] }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /ссылку/);
});

test("persists operator notification and daily summary settings", async () => {
  const saveResponse = await fetch(`${baseUrl}/api/settings/notifications`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ operatorChatIds: "496902572, -1004364536438", summaryChatId: "-1003832265865", summaryTime: "20:30", timeZone: "Europe/Moscow" }),
  });
  assert.equal(saveResponse.status, 200);
  const saved = await saveResponse.json();
  assert.equal(saved.operatorChatIds, "496902572, -1004364536438");
  assert.equal(saved.summaryChatId, "-1003832265865");

  const getResponse = await fetch(`${baseUrl}/api/settings/notifications`, { headers: { authorization } });
  assert.equal(getResponse.status, 200);
  const settings = await getResponse.json();
  assert.equal(settings.summaryTime, "20:30");
  assert.equal(settings.timeZone, "Europe/Moscow");
});

test("persists a custom lead pipeline", async () => {
  const defaultsResponse = await fetch(`${baseUrl}/api/pipeline`, { headers: { authorization } });
  assert.equal(defaultsResponse.status, 200);
  const defaults = (await defaultsResponse.json()).stages;
  assert.deepEqual(defaults.map((stage) => stage.id), ["new", "qualified", "dialogue", "won"]);

  const customStages = [
    { id: "new", title: "Входящие", color: "blue", isWon: false },
    { id: "demo", title: "Демо", color: "cyan", isWon: false },
    { id: "won", title: "Оплачено", color: "green", isWon: true },
  ];
  const saveResponse = await fetch(`${baseUrl}/api/pipeline`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ stages: customStages }),
  });
  assert.equal(saveResponse.status, 200);
  assert.deepEqual((await saveResponse.json()).stages, customStages);

  const savedResponse = await fetch(`${baseUrl}/api/pipeline`, { headers: { authorization } });
  assert.deepEqual((await savedResponse.json()).stages, customStages);

  const invalidResponse = await fetch(`${baseUrl}/api/pipeline`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ stages: [{ id: "only", title: "Без финала", color: "gray", isWon: false }] }),
  });
  assert.equal(invalidResponse.status, 400);

  const restoreResponse = await fetch(`${baseUrl}/api/pipeline`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ stages: defaults }),
  });
  assert.equal(restoreResponse.status, 200);
});

test("protects the internal message endpoint", async () => {
  const response = await fetch(`${baseUrl}/api/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: "telegram", recipientId: "1", text: "Test" }),
  });
  assert.equal(response.status, 401);
});
