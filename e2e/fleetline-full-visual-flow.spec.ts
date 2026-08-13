import path from "path";
import { expect, test, type Page } from "@playwright/test";
import { attachPerfProbe } from "./helpers/perf";

/**
 * Suite visual E2E INRETRANS OS
 * Alineada a la UI real:
 *  - Login torre de control
 *  - Presidencia cockpit + Command Palette (Cmd/Ctrl+K)
 *  - Logística: submenú servicios/conductores + Torre GPS/WS
 *  - Archivo: sellado SHA-256 (OCR UI aún Phase 2 — valida uplink de documento)
 */

const DEMO = {
  presidencia: { email: "presidencia@inretrans.com", password: "Inretrans2026*" },
  logistica: { email: "despacho@inretrans.com", password: "Inretrans2026*" },
};

const FIXTURE = path.join(__dirname, "fixtures", "sample-soat.txt");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#nodeEmail").fill(email);
  await page.locator("#nodePassword").fill(password);
  await page.getByRole("button", { name: /Autenticar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 30_000,
  });
}

test.describe.configure({ mode: "serial" });

test.describe("INRETRANS OS — flujo visual completo", () => {
  test("Flujo 1 · Login & Presidencia + Command Palette", async ({ page }) => {
    const perf = attachPerfProbe(page);
    try {
      const t0 = Date.now();
      await login(page, DEMO.presidencia.email, DEMO.presidencia.password);
      const loginMs = Date.now() - t0;
      console.log(`[PERF] login+redirect=${loginMs}ms`);
      expect(loginMs, "login + landing < 15s (incluye uplink simulado)").toBeLessThan(
        15_000,
      );

      const dash = await perf.measureNavigation("/presidencia");
      expect(dash.navigationMs).toBeLessThan(8_000);
      if (dash.navigationMs > 1_500) {
        console.warn(
          `[PERF ALERT] dashboard Presidencia ${dash.navigationMs}ms (objetivo visual < 1500ms en caliente)`,
        );
      }

      await expect(page.getByTestId("presidencia-cockpit")).toBeVisible();
      await expect(page.getByTestId("cockpit-status")).toContainText(
        /Nominal|gobierno/i,
      );
      await expect(page.getByText("Cockpit de Presidencia")).toBeVisible();

      // Buscador global (Command Palette) — proxy operativo del “buscador IA” Phase 1
      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+K" : "Control+K",
      );
      const search = page.getByTestId("command-search-input");
      await expect(search).toBeVisible();
      await search.fill("logística");
      await expect(page.getByRole("dialog")).toContainText(/Logística|logistica/i);
      await page.keyboard.press("Escape");
    } finally {
      perf.dispose();
    }
  });

  test("Flujo 2 · Despacho logístico + indicador compliance", async ({
    page,
  }) => {
    const perf = attachPerfProbe(page);
    try {
      await login(page, DEMO.logistica.email, DEMO.logistica.password);
      const snap = await perf.measureNavigation("/logistica/servicios");
      expect(snap.navigationMs).toBeLessThan(10_000);

      await expect(page.getByTestId("servicio-form")).toBeVisible();
      await page.getByPlaceholder("Origen").fill("Bogotá Terminal E2E");
      await page.getByPlaceholder("Destino").fill("Medellín E2E");

      const when = new Date(Date.now() + 3_600_000);
      const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
      await page.locator('input[type="datetime-local"]').fill(local);

      const vehicle = page.getByTestId("dispatch-vehicle");
      await expect
        .poll(async () => vehicle.locator("option").count(), { timeout: 25_000 })
        .toBeGreaterThan(1);

      const optionValues = await vehicle.locator("option").evaluateAll((opts) =>
        opts
          .map((o) => ({
            value: (o as HTMLOptionElement).value,
            text: o.textContent || "",
            disabled: (o as HTMLOptionElement).disabled,
          }))
          .filter((o) => o.value),
      );
      const preferred =
        optionValues.find((o) => /OK/i.test(o.text) && !o.disabled) ||
        optionValues.find((o) => !o.disabled) ||
        optionValues[0];
      expect(preferred?.value).toBeTruthy();
      await vehicle.selectOption(preferred!.value);

      const driver = page.getByTestId("dispatch-driver");
      const driverValues = await driver.locator("option").evaluateAll((opts) =>
        opts
          .map((o) => ({
            value: (o as HTMLOptionElement).value,
            text: o.textContent || "",
            disabled: (o as HTMLOptionElement).disabled,
          }))
          .filter((o) => o.value),
      );
      const driverPick =
        driverValues.find((o) => !o.disabled) || driverValues[0];
      if (driverPick?.value) await driver.selectOption(driverPick.value);

      const indicator = page.getByTestId("compliance-indicator");
      await expect(indicator).toBeVisible();
      const badgeText = await indicator.innerText();
      expect(badgeText).toMatch(/GREEN|YELLOW|RED|DISPONIBLE|BLOQUEADO/i);
      console.log(`[COMPLIANCE] ${badgeText.replace(/\s+/g, " ").trim()}`);
    } finally {
      perf.dispose();
    }
  });

  test("Flujo 3 · Archivo / sellado documental (fixture OCR)", async ({
    page,
  }) => {
    const perf = attachPerfProbe(page);
    try {
      await login(page, DEMO.logistica.email, DEMO.logistica.password);
      await perf.measureNavigation("/archivo");
      await expect(page).toHaveURL(/\/archivo/);
      await expect(page.getByText(/Archivo|Data Room/i).first()).toBeVisible();

      await expect(page.getByTestId("archivo-upload-form")).toBeVisible();
      await page.getByTestId("archivo-title").fill("SOAT E2E Visual BUS-001");
      await page.getByTestId("archivo-category").selectOption("OPS");
      await page.getByTestId("archivo-tags").fill("SOAT,E2E,BUS-001");
      await page.getByTestId("archivo-file").setInputFiles(FIXTURE);

      await page.getByTestId("archivo-submit").click();
      // Fallo RBAC/API aparece en role=alert; éxito en archivo-status
      const status = page.getByTestId("archivo-status");
      const alert = page.getByRole("alert");
      await expect
        .poll(async () => {
          if (await status.isVisible().catch(() => false)) return "ok";
          if (await alert.isVisible().catch(() => false)) {
            return `err:${await alert.innerText()}`;
          }
          return "pending";
        }, { timeout: 20_000 })
        .toBe("ok");
      await expect(status).toContainText(/SELLADO|HASH|INDEXADO/i);

      await expect(page.getByText(/SOAT E2E Visual BUS-001/i).first()).toBeVisible();
      console.log(
        "[OCR/ARCHIVO] Documento sellado — extracción OCR automática es Phase 2; validamos sello + índice.",
      );
    } finally {
      perf.dispose();
    }
  });

  test("Flujo 4 · Torre de Control GPS + WebSocket", async ({ page }) => {
    const perf = attachPerfProbe(page);
    try {
      await login(page, DEMO.logistica.email, DEMO.logistica.password);
      await perf.measureNavigation("/logistica/servicios");

      const wsStatus = page.getByTestId("gps-ws-status");
      await expect(page.getByTestId("gps-tower")).toBeVisible();

      // Esperar uplink Socket.IO (connect + join)
      await expect(wsStatus).toContainText(/en vivo|WebSocket|Socket\.IO/i, {
        timeout: 20_000,
      });

      // Listado de posiciones (puede estar vacío si no hay snapshot aún)
      await expect(page.getByText(/Posiciones GPS/i)).toBeVisible();
    } finally {
      perf.dispose();
    }
  });
});
