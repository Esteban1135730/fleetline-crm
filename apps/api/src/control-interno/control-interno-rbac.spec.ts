import { isPathDeniedForRole, hasPermission } from "@fsg/shared";

describe("RBAC AUDITOR_CONTROL_INTERNO", () => {
  it("bloquea operación de cajas y modificación de rutas", () => {
    expect(
      isPathDeniedForRole(
        "auditor_control_interno",
        "/tesoreria/dispersar",
      ),
    ).toBe(true);
    expect(
      isPathDeniedForRole(
        "auditor_control_interno",
        "/logistica/servicios/despachar",
      ),
    ).toBe(true);
  });

  it("permite forensic hub y lectura audit", () => {
    expect(
      isPathDeniedForRole(
        "auditor_control_interno",
        "/control-interno/dashboard",
      ),
    ).toBe(false);
    expect(hasPermission("auditor_control_interno", "audit_forense", "AUDIT")).toBe(
      true,
    );
    expect(hasPermission("auditor_control_interno", "hallazgos_ci", "CREATE")).toBe(
      true,
    );
    expect(
      hasPermission("auditor_control_interno", "tesoreria_dispersion", "CREATE"),
    ).toBe(false);
    expect(hasPermission("auditor_control_interno", "contabilidad", "UPDATE")).toBe(
      false,
    );
    expect(hasPermission("auditor_control_interno", "contabilidad", "READ")).toBe(
      true,
    );
  });
});
