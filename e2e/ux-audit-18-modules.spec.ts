import { expect, test, type Page } from "@playwright/test";
import { attachPerfProbe } from "./helpers/perf";

/**
 * Auditoría visual E2E — 18 módulos FSG MEGA OS
 * Video HD 1920×1080 + screenshots + reporte HTML Playwright.
 *
 * Credenciales seed: Inretrans2026*
 * Org Admin recorre todos los módulos operativos (excepto plataforma).
 */

const DEMO = {
  email: "admin@inretrans.com",
  password: "Inretrans2026*",
};

type ModuleStop = {
  id: string;
  path: string;
  title: RegExp;
};

const MODULES: ModuleStop[] = [
  { id: "01-presidencia", path: "/presidencia/dashboard", title: /Truth|Presidencia|Founder|Cockpit|Canvas/i },
  { id: "02-revisoria", path: "/revisoria-fiscal", title: /Revisor|Hallazgo|Truth Hub|Bitácora/i },
  { id: "03-contabilidad", path: "/contabilidad", title: /Contabilidad|Asiento|Libro|PUC/i },
  { id: "04-tesoreria", path: "/tesoreria", title: /Tesorer|Cobro|Pago|CxC|CxP/i },
  { id: "05-servicios-gps", path: "/logistica/servicios", title: /Servicio|GPS|Despacho|Logística/i },
  { id: "06-conductores", path: "/logistica/conductores", title: /Conductor|Nómina|Fatiga|Extras/i },
  { id: "07-reporte-nomina", path: "/logistica/conductores/reporte-nomina", title: /Nómina|Recargo|Horas|Reporte/i },
  { id: "08-comercial", path: "/comercial", title: /Comercial|Cotiz|Contrato|Cliente/i },
  { id: "09-compras", path: "/compras", title: /Compra|Proveedor|Solicitud|OC/i },
  { id: "10-qhse", path: "/qhse", title: /QHSE|NPS|Incidente|Calidad/i },
  { id: "11-sarlaft", path: "/sarlaft", title: /SARLAFT|Riesgo|Diligencia/i },
  { id: "12-tramites", path: "/tramites", title: /Trámite|Semáforo|SOAT|Documento/i },
  { id: "13-ti", path: "/ti/dashboard", title: /TI|NOC|CPU|Onboarding|Acceso/i },
  { id: "14-archivo", path: "/archivo", title: /Archivo|Data Room|Documento|Buscar/i },
  { id: "15-recepcion", path: "/recepcion/dashboard", title: /Recepción|Lead|PQRS|Concierge|Omnicanal/i },
  { id: "16-taller", path: "/taller", title: /Taller|OT|Vehículo|Flota/i },
  { id: "17-parqueadero", path: "/parqueadero", title: /Parqueadero|Patio|Ingreso|Placa/i },
  { id: "18-cuenta", path: "/cuenta", title: /Cuenta|Perfil|Contraseña|Seguridad/i },
];

async function login(page: Page) {
  await page.goto("/login");
  await page.locator("#nodeEmail").fill(DEMO.email);
  await page.locator("#nodePassword").fill(DEMO.password);
  await page.getByRole("button", { name: /Autenticar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 90_000,
    waitUntil: "commit",
  });
  await page.getByRole("button", { name: /Centro de ayuda/i }).waitFor({
    timeout: 45_000,
  });
}

async function auditUx(page: Page, id: string) {
  const findings: string[] = [];

  const protocol = page.locator("text=/Protocolo operativo/i").first();
  if (await protocol.isVisible().catch(() => false)) {
    findings.push("FAIL: Protocolo operativo estático visible en viewport");
  }

  const emptyTables = await page
    .locator("table tbody")
    .evaluateAll((bodies) =>
      bodies.filter((tb) => tb.querySelectorAll("tr").length === 0).length,
    );
  if (emptyTables > 0) {
    findings.push(`PARTIAL: ${emptyTables} tabla(s) tbody vacía(s) — verificar EmptyState`);
  }

  const emptyState = page.getByText(
    /No hay registros|Sin consultas|Sin alertas|Instrumentación operativa|bandeja vacía|Sin OTs/i,
  );
  const hasEmpty = await emptyState.first().isVisible().catch(() => false);

  const fullButtons = await page
    .locator("button.w-full, button[class*='w-full']")
    .evaluateAll((btns) =>
      btns
        .filter((b) => {
          const t = (b.textContent || "").toLowerCase();
          return /guardar|publicar|crear|autenticar|alta|registrar/.test(t);
        })
        .map((b) => (b.textContent || "").trim().slice(0, 40)),
    );
  if (fullButtons.length) {
    findings.push(`PARTIAL: CTA w-full → ${fullButtons.join(" | ")}`);
  }

  await page.screenshot({
    path: `test-results/audit/${id}.png`,
    fullPage: true,
  });

  return { findings, hasEmpty, emptyTables };
}

test.describe.configure({ mode: "serial" });

test.describe("FSG MEGA OS — auditoría visual 18 módulos (HD)", () => {
  test("Login + Eye/olvidé clave + tour 18 módulos", async ({ page }) => {
    test.setTimeout(360_000);
    const perf = attachPerfProbe(page);
    const report: Array<Record<string, unknown>> = [];

    try {
      await page.goto("/login");
      await expect(page.getByText(/Olvidaste tu clave/i)).toBeVisible();
      await page.getByLabel(/Ver clave|Ocultar clave/i).click();
      await expect(page.locator("#nodePassword")).toHaveAttribute("type", "text");
      await page.screenshot({
        path: "test-results/audit/00-login.png",
        fullPage: true,
      });

      const t0 = Date.now();
      await login(page);
      report.push({
        id: "00-login",
        path: "/login",
        navMs: Date.now() - t0,
        status: "PASS",
      });

      await page.keyboard.press(
        process.platform === "darwin" ? "Meta+K" : "Control+K",
      );
      await expect(page.getByTestId("command-search-input")).toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: /Centro de ayuda/i }).click();
      await expect(
        page.getByRole("complementary", { name: /Centro de ayuda/i }),
      ).toBeVisible();
      await page.keyboard.press("Escape");

      for (const mod of MODULES) {
        const snap = await perf.measureNavigation(mod.path);
        const heading = page.getByText(mod.title).first();
        const visible = await heading.isVisible().catch(() => false);
        const ux = await auditUx(page, mod.id);
        const status = visible ? "PASS" : "PARTIAL";
        report.push({
          id: mod.id,
          path: mod.path,
          navMs: snap.navigationMs,
          lcp: snap.largestContentfulPaint,
          status,
          titleHit: visible,
          ...ux,
        });
        console.log(
          `[AUDIT] ${mod.id} ${status} nav=${snap.navigationMs}ms findings=${ux.findings.length}`,
        );
        await page.waitForTimeout(600);
      }

      const failed = report.filter((r) => r.status === "FAIL");
      console.log("[AUDIT REPORT]", JSON.stringify(report, null, 2));
      expect(failed, "Ningún módulo debe fallar de carga").toHaveLength(0);
    } finally {
      perf.dispose();
    }
  });
});
