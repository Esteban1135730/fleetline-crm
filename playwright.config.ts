import { defineConfig, devices } from "@playwright/test";
import path from "path";

const ROOT = __dirname;
const HEADED =
  process.env.HEADED === "1" ||
  process.env.HEADED === "true" ||
  process.argv.includes("--headed");

const API_URL = process.env.PLAYWRIGHT_API_URL || "http://127.0.0.1:4000/health";
const WEB_URL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

/**
 * FLEETLINE OS — Playwright visual + performance suite
 * Web :3000 · API :4000 (Postgres/Redis vía docker compose local)
 *
 * Si :3000/:4000 ya responden HTTP, se reutilizan (evita EADDRINUSE).
 */
export default defineConfig({
  testDir: path.join(ROOT, "e2e"),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: "test-results",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
    screenshot: "on",
    video: { mode: "on", size: { width: 1920, height: 1080 } },
    headless: process.env.CI ? true : !HEADED,
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    locale: "es-CO",
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: `node scripts/playwright-ensure-server.mjs "${API_URL}" "pnpm --filter @fsg/api dev"`,
      cwd: ROOT,
      url: API_URL,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `node scripts/playwright-ensure-server.mjs "${WEB_URL}" "pnpm --filter @fsg/web dev"`,
      cwd: ROOT,
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
