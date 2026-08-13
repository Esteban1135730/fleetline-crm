import { isPathDeniedForRole } from "@fsg/shared";

describe("RBAC DIRECTOR_OPERATIVO — denegación Contabilidad / Pagos", () => {
  it("bloquea contabilidad y tesorería / dispersión", () => {
    expect(isPathDeniedForRole("director_operativo", "/contabilidad")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("director_operativo", "/api/v1/contabilidad"),
    ).toBe(true);
    expect(isPathDeniedForRole("director_operativo", "/tesoreria")).toBe(true);
    expect(
      isPathDeniedForRole("director_operativo", "/api/v1/tesoreria"),
    ).toBe(true);
    expect(
      isPathDeniedForRole(
        "director_operativo",
        "/api/v1/finanzas/cfo/dispersar/mfa-verify",
      ),
    ).toBe(true);
  });

  it("permite torre operativa y Gantt", () => {
    expect(
      isPathDeniedForRole(
        "director_operativo",
        "/operaciones/director/dashboard",
      ),
    ).toBe(false);
    expect(
      isPathDeniedForRole(
        "director_operativo",
        "/api/v1/operaciones/director/capacity-planning",
      ),
    ).toBe(false);
    expect(isPathDeniedForRole("director_operativo", "/logistica")).toBe(
      false,
    );
    expect(isPathDeniedForRole("director_operativo", "/taller")).toBe(false);
  });
});
