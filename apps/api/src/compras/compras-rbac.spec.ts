import { isPathDeniedForRole } from "@fsg/shared";

describe("RBAC LIDER_COMPRAS — denegación Torre / Operaciones", () => {
  const roles = ["lider_compras", "LIDER_COMPRAS", "compras", "COMPRAS"];

  it.each(roles)("%s bloquea logística / torre (403 lógico)", (role) => {
    expect(isPathDeniedForRole(role, "/logistica")).toBe(true);
    expect(isPathDeniedForRole(role, "/api/v1/logistica")).toBe(true);
    expect(isPathDeniedForRole(role, "/logistica/servicios")).toBe(true);
    expect(isPathDeniedForRole(role, "/logistica/despachar")).toBe(true);
    expect(isPathDeniedForRole(role, "/torre")).toBe(true);
  });

  it("permite compras, taller, trámites y lectura financiera", () => {
    expect(isPathDeniedForRole("lider_compras", "/compras/dashboard")).toBe(
      false,
    );
    expect(isPathDeniedForRole("lider_compras", "/api/v1/compras/ordenes/emitir")).toBe(
      false,
    );
    expect(isPathDeniedForRole("lider_compras", "/taller")).toBe(false);
    expect(isPathDeniedForRole("lider_compras", "/tramites")).toBe(false);
    expect(isPathDeniedForRole("lider_compras", "/contabilidad")).toBe(false);
    expect(isPathDeniedForRole("lider_compras", "/tesoreria")).toBe(false);
  });
});
