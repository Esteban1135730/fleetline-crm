import { isPathDeniedForRole, hasPermission, HARD_RULES } from "@fsg/shared";
import { isGestorDiscountAllowed } from "./dto/gestor-comercial.dto";

describe("RBAC GESTOR_COMERCIAL", () => {
  it("deniega Operaciones y Finanzas", () => {
    expect(isPathDeniedForRole("gestor_comercial", "/operaciones")).toBe(true);
    expect(isPathDeniedForRole("gestor_comercial", "/finanzas")).toBe(true);
    expect(isPathDeniedForRole("gestor_comercial", "/api/v1/finanzas")).toBe(
      true,
    );
    expect(isPathDeniedForRole("gestor_comercial", "/tesoreria")).toBe(true);
    expect(
      isPathDeniedForRole("gestor_comercial", "/operaciones/despacho"),
    ).toBe(true);
  });

  it("permite CRM EDIT, omnicanal EDIT, contratos READ/CREATE borrador", () => {
    expect(
      isPathDeniedForRole("gestor_comercial", "/comercial/gestor/dashboard"),
    ).toBe(false);
    expect(hasPermission("gestor_comercial", "crm_comercial", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("gestor_comercial", "crm_comercial", "UPDATE")).toBe(
      true,
    );
    expect(hasPermission("gestor_comercial", "crm_comercial", "DELETE")).toBe(
      false,
    );
    expect(hasPermission("gestor_comercial", "omnicanal", "UPDATE")).toBe(true);
    expect(hasPermission("gestor_comercial", "contratos", "READ")).toBe(true);
    expect(hasPermission("gestor_comercial", "finanzas", "READ")).toBe(false);
    expect(
      hasPermission("gestor_comercial", "logistica_despacho", "READ"),
    ).toBe(false);
  });

  it("tope descuento gestor 5%", () => {
    expect(HARD_RULES.GESTOR_COMERCIAL_MAX_DISCOUNT_PCT).toBe(5);
    expect(isGestorDiscountAllowed(5)).toBe(true);
    expect(isGestorDiscountAllowed(5.1)).toBe(false);
    expect(isGestorDiscountAllowed(10)).toBe(false);
  });
});
