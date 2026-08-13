import { expect, type Page } from "@playwright/test";

export const ADMIN = {
  email: "admin@inretrans.com",
  password: "Inretrans2026*",
};

export const E2E_PASSWORD = "InretransE2E2026*";

export async function loginAs(
  page: Page,
  email: string,
  password: string,
  fallbackHome?: string,
) {
  await page.goto("/login");
  await page.locator("#nodeEmail").fill(email);
  await page.locator("#nodePassword").fill(password);
  await page.getByRole("button", { name: /Autenticar/i }).click();
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 45_000,
      waitUntil: "commit",
    });
  } catch (err) {
    const success = page.getByText(/Nodo autenticado/i);
    if (fallbackHome && (await success.isVisible().catch(() => false))) {
      await page.goto(fallbackHome, { waitUntil: "domcontentloaded" });
    } else {
      throw err;
    }
  }
  await page.getByRole("button", { name: /Centro de ayuda/i }).first().waitFor({
    timeout: 45_000,
  });
}

export async function logout(page: Page) {
  const btn = page.getByTitle("Cerrar sesión").or(
    page.getByRole("button", { name: /Cerrar sesión/i }),
  );
  if (await btn.first().isVisible().catch(() => false)) {
    await btn.first().click();
  }
  try {
    await page.waitForURL(/\/login/, { timeout: 15_000, waitUntil: "commit" });
  } catch {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  }
  await page.evaluate(() => {
    localStorage.removeItem("fsg_token");
    localStorage.removeItem("fsg_user");
  });
}

export async function gotoModule(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

export async function createUserViaUi(
  page: Page,
  data: { name: string; email: string; password: string; role: string },
) {
  await gotoModule(page, "/usuarios");
  await page.getByTestId("usuarios-name").fill(data.name);
  await page.getByTestId("usuarios-email").fill(data.email);
  await page.getByTestId("usuarios-password").fill(data.password);
  await page.getByTestId("usuarios-role").selectOption(data.role);
  await page.getByTestId("usuarios-submit").click();

  const emailInput = page.locator(`input[value="${data.email}"]`);
  await expect(emailInput).toBeVisible({ timeout: 20_000 });

  const pendingAuth = page
    .locator("li")
    .filter({ hasText: data.email })
    .getByRole("button", { name: /Autorizar/i });
  if (await pendingAuth.isVisible().catch(() => false)) {
    await pendingAuth.click();
  }

  const row = page.locator("tr").filter({ has: emailInput });
  const authorize = row.getByRole("button", { name: /Autorizar/i });
  if (await authorize.isVisible().catch(() => false)) {
    await authorize.click();
  }

  await expect(row.getByText(/ACTIVO/i)).toBeVisible({ timeout: 15_000 });
}

export async function submitAndWait(
  page: Page,
  click: () => Promise<unknown>,
  urlPart: string,
  method = "POST",
) {
  const response = page.waitForResponse(
    (res) =>
      res.url().includes(urlPart) && res.request().method() === method,
    { timeout: 25_000 },
  );
  await click();
  const res = await response;
  expect(
    res.ok(),
    `uplink ${method} ${urlPart} → ${res.status()}`,
  ).toBeTruthy();
  return res;
}
