import { isPathDeniedForRole } from "@fsg/shared";

describe("RBAC GESTOR_OPERATIVO — denegación Finanzas / Nómina / Facturación", () => {
  it("bloquea finanzas, tesorería, contabilidad y nómina", () => {
    expect(isPathDeniedForRole("gestor_operativo", "/finanzas")).toBe(true);
    expect(isPathDeniedForRole("gestor_operativo", "/api/v1/finanzas")).toBe(
      true,
    );
    expect(isPathDeniedForRole("gestor_operativo", "/tesoreria")).toBe(true);
    expect(isPathDeniedForRole("gestor_operativo", "/contabilidad")).toBe(
      true,
    );
    expect(isPathDeniedForRole("gestor_operativo", "/nomina")).toBe(true);
    expect(isPathDeniedForRole("gestor_operativo", "/api/v1/nomina")).toBe(
      true,
    );
  });

  it("permite despacho y gantt operativo", () => {
    expect(
      isPathDeniedForRole(
        "gestor_operativo",
        "/operaciones/despacho/dashboard",
      ),
    ).toBe(false);
    expect(
      isPathDeniedForRole(
        "gestor_operativo",
        "/api/v1/operaciones/despacho/asignar-viaje",
      ),
    ).toBe(false);
    expect(isPathDeniedForRole("gestor_operativo", "/logistica")).toBe(false);
  });
});
