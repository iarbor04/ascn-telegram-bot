export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const globalState = globalThis as typeof globalThis & { __ascnAutomationTimer?: ReturnType<typeof setInterval> };
  if (globalState.__ascnAutomationTimer) return;
  const [{ processDueAutomations }, { processDailySummary }] = await Promise.all([import("@/lib/automation-runner"), import("@/lib/notification-settings")]);
  globalState.__ascnAutomationTimer = setInterval(() => {
    void processDueAutomations();
    void processDailySummary();
  }, 15_000);
  globalState.__ascnAutomationTimer.unref();
}
