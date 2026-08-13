import { expect, test } from "@playwright/test";
import {
  ADMIN,
  E2E_PASSWORD,
  createUserViaUi,
  gotoModule,
  loginAs,
  logout,
  submitAndWait,
} from "./helpers/session";

/**
 * Flujo E2E de punta a punta:
 *  1) Admin crea usuarios operativos (alta + autorización si PENDING)
 *  2) Admin ejecuta mutaciones reales en módulos clave
 *  3) Cada usuario creado inicia sesión y aterriza en su home
 *
 * Corre serial. Requiere API+web locales y seed demo.
 */

const STAMP = Date.now();

const PROVISION = [
  {
    role: "recepcionista",
    name: `E2E Recepción ${STAMP}`,
    home: /\/recepcion/,
    path: "/recepcion/dashboard",
  },
  {
    role: "gestor_operativo",
    name: `E2E Despacho ${STAMP}`,
    home: /\/operaciones\/despacho|\/logistica/,
    path: "/operaciones/despacho/dashboard",
  },
  {
    role: "mecanico",
    name: `E2E Mecánico ${STAMP}`,
    home: /\/taller/,
    path: "/taller/mecanico",
  },
  {
    role: "auxiliar_patio",
    name: `E2E Patio ${STAMP}`,
    home: /\/patio|\/parqueadero/,
    path: "/patio/yard-app",
  },
  {
    role: "lider_compras",
    name: `E2E Compras ${STAMP}`,
    home: /\/compras/,
    path: "/compras/dashboard",
  },
  {
    role: "tesoreria",
    name: `E2E Tesorería ${STAMP}`,
    home: /\/tesoreria/,
    path: "/tesoreria",
  },
  {
    role: "lider_qhse",
    name: `E2E QHSE ${STAMP}`,
    home: /\/qhse/,
    path: "/qhse/dashboard",
  },
  {
    role: "conductor",
    name: `E2E Conductor ${STAMP}`,
    home: /\/pilot|\/apps/,
    path: "/pilot",
  },
] as const;

function emailFor(role: string) {
  return `e2e.${role}.${STAMP}@inretrans.test`;
}

test.describe.configure({ mode: "serial" });

test.describe("FSG MEGA OS — flujo E2E completo (alta usuarios + operación)", () => {
  test.setTimeout(480_000);

  test("1 · Admin provisiona usuarios operativos", async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await gotoModule(page, "/usuarios");
    await expect(
      page.getByText(/Directorio de accesos|Directorio/i).first(),
    ).toBeVisible();

    for (const u of PROVISION) {
      const email = emailFor(u.role);
      await createUserViaUi(page, {
        name: u.name,
        email,
        password: E2E_PASSWORD,
        role: u.role,
      });
      await expect(page.locator(`input[value="${email}"]`)).toBeVisible();
      console.log(`[E2E] usuario creado ${email} (${u.role})`);
    }
  });

  test("2 · Admin ejecuta el flujo operativo cruzado", async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);

    await gotoModule(page, "/sarlaft");
    await page.getByRole("button", { name: /Nueva consulta/i }).first().click();
    await page
      .locator("#sarlaft-form input")
      .nth(0)
      .fill(`Proveedor E2E ${STAMP}`);
    await page.locator("#sarlaft-form input").nth(1).fill(`NIT-${STAMP}`);
    await submitAndWait(
      page,
      () =>
        page.getByRole("button", { name: /Registrar chequeo/i }).click(),
      "/sarlaft/checks",
    );
    await expect(page.getByText(`Proveedor E2E ${STAMP}`)).toBeVisible({
      timeout: 20_000,
    });

    await gotoModule(page, "/compras");
    await page.getByRole("button", { name: /Crear Solicitud/i }).first().click();
    await expect(page.getByTestId("compras-description")).toBeVisible();
    await page.getByTestId("compras-description").fill(`Filtros E2E ${STAMP}`);
    await page.getByTestId("compras-supplier").fill("Repuestos Andes SAS");
    await page.getByTestId("compras-qty").fill("2");
    await page.getByTestId("compras-amount").fill("350000");
    await submitAndWait(
      page,
      () => page.getByTestId("compras-submit").click(),
      "/compras/orders",
    );
    await expect(
      page.getByRole("dialog", { name: /Solicitud de compra/i }),
    ).toBeHidden({ timeout: 15_000 });
    await expect(
      page.locator("table").getByText(`Filtros E2E ${STAMP}`).first(),
    ).toBeVisible({ timeout: 20_000 });

    await gotoModule(page, "/tesoreria");
    const facturaForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: /Registrar factura/i }) });
    await facturaForm.locator("select").first().selectOption("PAYABLE");
    await facturaForm.getByPlaceholder(/proveedor/i).fill(`CxP E2E ${STAMP}`);
    await facturaForm.getByPlaceholder(/Monto/i).fill("125000");
    const due = new Date();
    due.setDate(due.getDate() + 15);
    await facturaForm
      .locator('input[type="date"]')
      .fill(due.toISOString().slice(0, 10));
    await facturaForm
      .getByPlaceholder(/Descripción/i)
      .fill(`Factura E2E ${STAMP}`);
    await submitAndWait(
      page,
      () =>
        facturaForm.getByRole("button", { name: /Registrar factura/i }).click(),
      "/finance/invoices",
    );
    await expect(
      page
        .getByText(`Factura E2E ${STAMP}`)
        .or(page.getByText(`CxP E2E ${STAMP}`))
        .first(),
    ).toBeVisible({ timeout: 20_000 });

    await gotoModule(page, "/rrhh");
    await page.getByTestId("rrhh-alta-open").click();
    await page
      .locator("#rrhh-alta-form input")
      .nth(0)
      .fill(`Operario E2E ${STAMP}`);
    await page.locator("#rrhh-alta-form input").nth(1).fill(`CC${STAMP}`);
    await submitAndWait(
      page,
      () =>
        page.getByRole("button", { name: /Indexar expediente/i }).click(),
      "/rrhh/employees",
    );
    await expect(page.getByText(`Operario E2E ${STAMP}`)).toBeVisible({
      timeout: 20_000,
    });

    await gotoModule(page, "/parqueadero");
    const plate = `T${String(STAMP).slice(-5)}`;
    await page.getByPlaceholder(/Placa/i).fill(plate);
    await page.getByPlaceholder(/Conductor/i).fill("Conductor E2E");
    await page.getByPlaceholder(/Guarda/i).fill("Guarda E2E");
    await submitAndWait(
      page,
      () =>
        page
          .getByRole("button", {
            name: /Check-?in|Registrar ingreso|Ingreso/i,
          })
          .click(),
      "/parqueadero/checkin",
    );
    await expect(page.getByText(plate).first()).toBeVisible({
      timeout: 20_000,
    });

    await gotoModule(page, "/qhse");
    await page.getByRole("button", { name: /Nuevo Reporte QHSE/i }).first().click();
    await expect(page.locator("#qhse-report-form")).toBeVisible();
    await page
      .locator("#qhse-report-form textarea")
      .fill(`Incidente E2E ${STAMP}`);
    await submitAndWait(
      page,
      () => page.locator('button[form="qhse-report-form"]').click(),
      "/calidad/events",
    );
    await expect(page.getByText(`Incidente E2E ${STAMP}`).first()).toBeVisible({
      timeout: 20_000,
    });

    await gotoModule(page, "/logistica/servicios");
    await expect(page.getByTestId("panel-servicios")).toBeVisible();
    const openCreate = page
      .getByRole("button", { name: /Nuevo servicio|Crear servicio/i })
      .first();
    if (await openCreate.isVisible().catch(() => false)) {
      await openCreate.click();
    }
    if (await page.getByTestId("servicio-form").isVisible().catch(() => false)) {
      await expect(page.getByTestId("dispatch-vehicle")).toBeVisible();
    }

    await gotoModule(page, "/archivo");
    await expect(page.getByText(/Archivo|Data Room/i).first()).toBeVisible();
    await page.getByTestId("archivo-open-upload").click();
    await page.getByTestId("archivo-title").fill(`Póliza E2E ${STAMP}`);
    await page.getByTestId("archivo-tags").fill("e2e");
    await submitAndWait(
      page,
      () => page.getByTestId("archivo-submit").click(),
      "/archivo/documents",
    );
    await expect(page.getByText(`Póliza E2E ${STAMP}`).first()).toBeVisible({
      timeout: 20_000,
    });

    for (const path of [
      "/comercial",
      "/tramites",
      "/taller",
      "/recepcion/dashboard",
      "/contabilidad",
      "/gerencia",
    ]) {
      await gotoModule(page, path);
      await expect(
        page.getByRole("button", { name: /Centro de ayuda/i }).first(),
      ).toBeVisible();
    }

    await gotoModule(page, "/cuenta");
    await expect(page.getByPlaceholder(/Confirmar/i).first()).toBeVisible();

    console.log("[E2E] flujo operativo cruzado OK");
  });

  test("3 · Cada usuario creado autentica y entra a su home", async ({
    page,
  }) => {
    for (const u of PROVISION) {
      const email = emailFor(u.role);
      await loginAs(page, email, E2E_PASSWORD, u.path);
      await expect(page).toHaveURL(u.home, { timeout: 30_000 });
      await expect(
        page.getByRole("button", { name: /Centro de ayuda/i }).first(),
      ).toBeVisible();
      console.log(`[E2E] login OK ${email} → ${page.url()}`);
      await logout(page);
    }
  });
});
