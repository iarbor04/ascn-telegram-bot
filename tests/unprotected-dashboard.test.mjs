// A deployment without ADMIN_PASSWORD serves the dashboard to anyone, so it has to say so.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";

const port = 3126;
const baseUrl = `http://127.0.0.1:${port}`;
let server;
let dataDirectory;

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), "ascn-open-test-"));
  const env = { ...process.env, DATA_DIR: dataDirectory };
  delete env.ADMIN_PASSWORD;
  server = spawn("npm", ["start", "--", "-p", String(port)], { stdio: "ignore", env });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
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
  await rm(dataDirectory, { recursive: true, force: true });
});

test("reports that the dashboard has no password", async () => {
  const response = await fetch(`${baseUrl}/api/channels/status`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).adminProtected, false);
});

test("warns in the dashboard that it is open to anyone", async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Кабинет открыт без пароля/);
});
