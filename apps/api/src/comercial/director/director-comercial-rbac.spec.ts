import { isPathDeniedForRole, hasPermission } from "@fsg/shared";

describe("RBAC DIRECTOR_COMERCIAL", () => {
  it("deniega Operaciones, Taller y Contabilidad (ejecución)", () => {
    expect(isPathDeniedForRole("director_comercial", "/operaciones")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("director_comercial", "/operaciones/despacho"),
    ).toBe(true);
    expect(isPathDeniedForRole("director_comercial", "/taller")).toBe(true);
    expect(isPathDeniedForRole("director_comercial", "/api/v1/taller")).toBe(
      true,
    );
    expect(isPathDeniedForRole("director_comercial", "/contabilidad")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("director_comercial", "/api/v1/contabilidad"),
    ).toBe(true);
  });

  it("permite CRM / cotizador / contratos y finanzas EDIT", () => {
    expect(
      isPathDeniedForRole(
        "director_comercial",
        "/comercial/director/dashboard",
      ),
    ).toBe(false);
    expect(
      hasPermission("director_comercial", "crm_comercial", "CREATE"),
    ).toBe(true);
    expect(
      hasPermission("director_comercial", "crm_comercial", "DELETE"),
    ).toBe(true);
    expect(hasPermission("director_comercial", "contratos", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("director_comercial", "finanzas", "UPDATE")).toBe(
      true,
    );
    expect(hasPermission("director_comercial", "torre_rutas", "READ")).toBe(
      true,
    );
  });

  it("bloquea ejecución ops / taller / contabilidad por permiso", () => {
    expect(
      hasPermission("director_comercial", "logistica_despacho", "READ"),
    ).toBe(false);
    expect(hasPermission("director_comercial", "taller", "READ")).toBe(false);
    expect(hasPermission("director_comercial", "contabilidad", "READ")).toBe(
      false,
    );
  });
});
