import { isPathDeniedForRole } from "@fsg/shared";

describe("RBAC OPERADOR_CENTRO_CONTROL — denegación Finanzas / Nómina / Contratos", () => {
  it("bloquea finanzas, nómina y contratos", () => {
    expect(isPathDeniedForRole("operador_centro_control", "/finanzas")).toBe(
      true,
    );
    expect(isPathDeniedForRole("operador_centro_control", "/nomina")).toBe(
      true,
    );
    expect(isPathDeniedForRole("operador_centro_control", "/contratos")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("operador_centro_control", "/api/v1/contratos"),
    ).toBe(true);
  });

  it("permite watchtower", () => {
    expect(
      isPathDeniedForRole(
        "operador_centro_control",
        "/centro-control/dashboard",
      ),
    ).toBe(false);
    expect(
      isPathDeniedForRole(
        "operador_centro_control",
        "/api/v1/centro-control/sos/activar-protocolo",
      ),
    ).toBe(false);
  });
});
