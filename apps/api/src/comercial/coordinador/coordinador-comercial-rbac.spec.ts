import { isPathDeniedForRole, hasPermission, HARD_RULES } from "@fsg/shared";
import { coordinatorCanApproveDiscount } from "./dto/coordinador-comercial.dto";

describe("RBAC COORDINADOR_COMERCIAL", () => {
  it("deniega Contabilidad y Tesorería", () => {
    expect(isPathDeniedForRole("coordinador_comercial", "/contabilidad")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("coordinador_comercial", "/api/v1/contabilidad"),
    ).toBe(true);
    expect(isPathDeniedForRole("coordinador_comercial", "/tesoreria")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("coordinador_comercial", "/api/v1/tesoreria"),
    ).toBe(true);
  });

  it("permite CRM FULL, contratos EDIT, torre READ", () => {
    expect(
      isPathDeniedForRole(
        "coordinador_comercial",
        "/comercial/coordinador/dashboard",
      ),
    ).toBe(false);
    expect(
      hasPermission("coordinador_comercial", "crm_comercial", "DELETE"),
    ).toBe(true);
    expect(hasPermission("coordinador_comercial", "contratos", "UPDATE")).toBe(
      true,
    );
    expect(hasPermission("coordinador_comercial", "torre_rutas", "READ")).toBe(
      true,
    );
    expect(hasPermission("coordinador_comercial", "contabilidad", "READ")).toBe(
      false,
    );
    expect(
      hasPermission("coordinador_comercial", "tesoreria_dispersion", "READ"),
    ).toBe(false);
  });

  it("tope Nivel 1 descuento 15%", () => {
    expect(HARD_RULES.COORDINADOR_COMERCIAL_MAX_DISCOUNT_PCT).toBe(15);
    expect(coordinatorCanApproveDiscount(15)).toBe(true);
    expect(coordinatorCanApproveDiscount(15.1)).toBe(false);
    expect(HARD_RULES.COMERCIAL_LEAD_SLA_HOURS).toBe(2);
  });
});
