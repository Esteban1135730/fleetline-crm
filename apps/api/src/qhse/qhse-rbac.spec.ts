import { isPathDeniedForRole } from "@fsg/shared";

describe("RBAC LIDER_QHSE — denegación Contabilidad / Tesorería", () => {
  const roles = ["lider_qhse", "LIDER_QHSE", "qhse", "QHSE"];

  it.each(roles)(
    "%s recibe 403 lógico en rutas de Contabilidad y Tesorería",
    (role) => {
      expect(isPathDeniedForRole(role, "/contabilidad")).toBe(true);
      expect(isPathDeniedForRole(role, "/api/v1/contabilidad")).toBe(true);
      expect(isPathDeniedForRole(role, "/contabilidad/auxiliar/dashboard")).toBe(
        true,
      );
      expect(isPathDeniedForRole(role, "/tesoreria")).toBe(true);
      expect(isPathDeniedForRole(role, "/api/v1/tesoreria")).toBe(true);
      expect(isPathDeniedForRole(role, "/finanzas/cfo/dashboard")).toBe(true);
      expect(isPathDeniedForRole(role, "/api/v1/finanzas/cfo/dashboard")).toBe(
        true,
      );
    },
  );

  it("permite rutas QHSE operativas", () => {
    expect(isPathDeniedForRole("lider_qhse", "/qhse/dashboard")).toBe(false);
    expect(isPathDeniedForRole("lider_qhse", "/api/v1/qhse/calidad/nps-summary")).toBe(
      false,
    );
    expect(isPathDeniedForRole("lider_qhse", "/rrhh")).toBe(false);
  });
});
