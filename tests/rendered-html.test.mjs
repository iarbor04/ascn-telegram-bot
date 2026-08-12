import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test, { after, before } from "node:test";

const port = 3123;
const baseUrl = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  server = spawn("npm", ["start", "--", "-p", String(port)], {
    stdio: "ignore",
    env: {
      ...process.env,
      INTERNAL_API_KEY: "test-internal-key",
      MAX_WEBHOOK_SECRET: "test-max-secret",
      AVITO_WEBHOOK_SECRET: "test-avito-secret",
    },
  });

  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error("Production server did not start in time");
});

after(() => server?.kill("SIGTERM"));

test("server-renders the ASCN broadcast dashboard", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Воронка лидов/);
  assert.match(html, /Рассылки/);
  assert.match(html, /Telegram/);
  assert.match(html, /WhatsApp/);
  assert.doesNotMatch(html, /Avito|мессенджер MAX/i);
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
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.match(html, /ASCN Broadcast/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("accepts and normalizes hidden channel webhooks", async () => {
  const maxResponse = await fetch(`${baseUrl}/api/webhooks/max`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-max-bot-api-secret": "test-max-secret" },
    body: JSON.stringify({
      message: {
        sender: { user_id: 77 },
        recipient: { chat_id: 88 },
        body: { text: "Тест" },
        timestamp: Date.now(),
      },
    }),
  });
  assert.equal(maxResponse.status, 200);
  assert.deepEqual(await maxResponse.json(), { ok: true, accepted: 1 });

  const avitoResponse = await fetch(`${baseUrl}/api/webhooks/avito?secret=test-avito-secret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: { value: { chat_id: "chat-1", user_id: 99, content: { text: "Тест" } } } }),
  });
  assert.equal(avitoResponse.status, 200);
  assert.deepEqual(await avitoResponse.json(), { ok: true, accepted: 1 });
});

test("protects the internal message endpoint", async () => {
  const response = await fetch(`${baseUrl}/api/messages/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ channel: "telegram", recipientId: "1", text: "Test" }),
  });
  assert.equal(response.status, 401);
});
