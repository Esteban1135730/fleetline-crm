import { isPathDeniedForRole } from "@fsg/shared";

describe("RBAC COORDINADOR_CAMPO — denegación Finanzas / Nómina / Comercial", () => {
  it("bloquea finanzas, nómina y comercial", () => {
    expect(isPathDeniedForRole("coordinador_campo", "/finanzas")).toBe(true);
    expect(isPathDeniedForRole("coordinador_campo", "/tesoreria")).toBe(true);
    expect(isPathDeniedForRole("coordinador_campo", "/contabilidad")).toBe(
      true,
    );
    expect(isPathDeniedForRole("coordinador_campo", "/nomina")).toBe(true);
    expect(isPathDeniedForRole("coordinador_campo", "/comercial")).toBe(true);
    expect(isPathDeniedForRole("coordinador_campo", "/api/v1/comercial")).toBe(
      true,
    );
  });

  it("permite field commander y radar", () => {
    expect(
      isPathDeniedForRole(
        "coordinador_campo",
        "/operaciones/campo/dashboard",
      ),
    ).toBe(false);
    expect(
      isPathDeniedForRole(
        "coordinador_campo",
        "/api/v1/operaciones/campo/radar-geocerca",
      ),
    ).toBe(false);
  });
});
