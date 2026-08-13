import { isPathDeniedForRole, hasPermission } from "@fsg/shared";

describe("RBAC GESTOR_VINCULACIONES", () => {
  it("deniega Logística / Torre de Control", () => {
    expect(isPathDeniedForRole("gestor_vinculaciones", "/logistica")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("gestor_vinculaciones", "/operaciones/despacho"),
    ).toBe(true);
    expect(
      isPathDeniedForRole("gestor_vinculaciones", "/centro-control/dashboard"),
    ).toBe(true);
  });

  it("permite onboarding y deniega mutación logística", () => {
    expect(
      isPathDeniedForRole("gestor_vinculaciones", "/vinculaciones/dashboard"),
    ).toBe(false);
    expect(
      hasPermission("gestor_vinculaciones", "vinculaciones_afiliados", "CREATE"),
    ).toBe(true);
    expect(
      hasPermission("gestor_vinculaciones", "vinculaciones_conductores", "UPDATE"),
    ).toBe(true);
    expect(
      hasPermission("gestor_vinculaciones", "archivo_digital", "CREATE"),
    ).toBe(true);
    expect(hasPermission("gestor_vinculaciones", "finanzas", "READ")).toBe(
      true,
    );
    expect(
      hasPermission("gestor_vinculaciones", "logistica_despacho", "READ"),
    ).toBe(false);
  });
});
