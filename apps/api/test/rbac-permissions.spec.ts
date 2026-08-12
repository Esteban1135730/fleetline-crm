import { ForbiddenException } from "@nestjs/common";
import {
  RBAC_FORBIDDEN_MESSAGE,
  hasPermission,
  isPathDeniedForRole,
  normalizeRole,
} from "@fsg/shared";
import { RolesGuard } from "../src/auth/roles.guard";
import { PermissionsGuard } from "../src/auth/permissions.guard";
import { ModulesGuard } from "../src/auth/modules.guard";

function mockCtx(opts: {
  role: string;
  path: string;
  rolesMeta?: string[] | undefined;
  permissionsMeta?: { resource: string; action: string } | undefined;
  modulesMeta?: string[] | undefined;
}) {
  const reflector = {
    getAllAndOverride: (key: string) => {
      if (key === "roles") return opts.rolesMeta;
      if (key === "permissions") return opts.permissionsMeta;
      if (key === "modules") return opts.modulesMeta;
      return undefined;
    },
  };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { role: opts.role, userId: "u1", organizationId: "o1" },
        originalUrl: opts.path,
        url: opts.path,
        path: opts.path,
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { reflector, ctx };
}

describe("RBAC permissions suite", () => {
  describe("matriz por rol", () => {
    it("RECEPCIONISTA: visitas/omnicanal CUD + CRM/PQRS CREATE + radar READ", () => {
      const role = normalizeRole("RECEPCIONISTA");
      expect(hasPermission(role, "visitas", "CREATE")).toBe(true);
      expect(hasPermission(role, "visitas", "UPDATE")).toBe(true);
      expect(hasPermission(role, "omnicanal", "UPDATE")).toBe(true);
      expect(hasPermission(role, "crm_comercial", "CREATE")).toBe(true);
      expect(hasPermission(role, "crm_comercial", "UPDATE")).toBe(false);
      expect(hasPermission(role, "qhse_pqrs", "CREATE")).toBe(true);
      expect(hasPermission(role, "torre_rutas", "READ")).toBe(true);
      expect(hasPermission(role, "finanzas", "READ")).toBe(false);
      expect(hasPermission(role, "rrhh", "READ")).toBe(false);
      expect(hasPermission(role, "logistica_despacho", "CREATE")).toBe(false);
    });

    it("CONDUCTOR: solo mis_viajes; deniega omnicanal y finanzas", () => {
      expect(hasPermission("conductor", "mis_viajes", "UPDATE")).toBe(true);
      expect(hasPermission("conductor", "omnicanal", "READ")).toBe(false);
      expect(hasPermission("conductor", "finanzas", "READ")).toBe(false);
      expect(isPathDeniedForRole("conductor", "/api/v1/recepcion/omnicanal/inbox")).toBe(
        true,
      );
      expect(isPathDeniedForRole("conductor", "/finanzas/reportes")).toBe(true);
    });

    it("GESTOR_COMERCIAL / RRHH / SUPERVISOR_LOGISTICA / FINANZAS", () => {
      expect(hasPermission("gestor_comercial", "crm_comercial", "DELETE")).toBe(
        true,
      );
      expect(hasPermission("vinculaciones", "personal", "UPDATE")).toBe(true);
      expect(hasPermission("rrhh", "nomina", "READ")).toBe(true);
      expect(
        hasPermission(
          normalizeRole("SUPERVISOR_LOGISTICA"),
          "logistica_despacho",
          "CREATE",
        ),
      ).toBe(true);
      expect(hasPermission(normalizeRole("FINANZAS"), "finanzas", "UPDATE")).toBe(
        true,
      );
    });
  });

  describe("Guards NestJS — simulación JWT por rol", () => {
    it("1) RECEPCIONISTA HTTP 200 en POST /recepcion/visitas y POST /crm/leads", () => {
      const rolesGuard = new RolesGuard(
        mockCtx({
          role: "recepcionista",
          path: "/api/v1/recepcion/visitas",
          rolesMeta: ["recepcionista", "org_admin"],
        }).reflector as never,
      );
      expect(
        rolesGuard.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/api/v1/recepcion/visitas",
            rolesMeta: ["recepcionista", "org_admin"],
          }).ctx as never,
        ),
      ).toBe(true);

      const permVisitas = new PermissionsGuard(
        mockCtx({
          role: "recepcionista",
          path: "/api/v1/recepcion/visitas",
          permissionsMeta: { resource: "visitas", action: "CREATE" },
        }).reflector as never,
      );
      expect(
        permVisitas.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/api/v1/recepcion/visitas",
            permissionsMeta: { resource: "visitas", action: "CREATE" },
          }).ctx as never,
        ),
      ).toBe(true);

      const permLead = new PermissionsGuard(
        mockCtx({
          role: "recepcionista",
          path: "/api/v1/recepcion/crm/leads",
          permissionsMeta: { resource: "crm_comercial", action: "CREATE" },
        }).reflector as never,
      );
      expect(
        permLead.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/api/v1/recepcion/crm/leads",
            permissionsMeta: { resource: "crm_comercial", action: "CREATE" },
          }).ctx as never,
        ),
      ).toBe(true);
    });

    it("2) RECEPCIONISTA HTTP 403 en GET /finanzas/reportes y POST /logistica/despachar", () => {
      const rolesFinanzas = new RolesGuard(
        mockCtx({
          role: "recepcionista",
          path: "/finanzas/reportes",
          rolesMeta: ["tesoreria", "finanzas", "director_financiero"],
        }).reflector as never,
      );
      try {
        rolesFinanzas.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/finanzas/reportes",
            rolesMeta: ["tesoreria", "finanzas", "director_financiero"],
          }).ctx as never,
        );
        fail("debía lanzar 403");
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).message).toBe(RBAC_FORBIDDEN_MESSAGE);
      }

      const modulesFinanzas = new ModulesGuard(
        mockCtx({
          role: "recepcionista",
          path: "/api/v1/finanzas/reportes",
          modulesMeta: ["tesoreria", "finanzas"],
        }).reflector as never,
      );
      expect(() =>
        modulesFinanzas.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/api/v1/finanzas/reportes",
            modulesMeta: ["tesoreria", "finanzas"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      const rolesDespacho = new RolesGuard(
        mockCtx({
          role: "recepcionista",
          path: "/logistica/servicios/despachar",
          rolesMeta: ["gestor_operativo", "centro_control"],
        }).reflector as never,
      );
      expect(() =>
        rolesDespacho.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/logistica/servicios/despachar",
            rolesMeta: ["gestor_operativo", "centro_control"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      const permDespacho = new PermissionsGuard(
        mockCtx({
          role: "recepcionista",
          path: "/logistica/servicios/despachar",
          permissionsMeta: { resource: "logistica_despacho", action: "CREATE" },
        }).reflector as never,
      );
      expect(() =>
        permDespacho.canActivate(
          mockCtx({
            role: "recepcionista",
            path: "/logistica/servicios/despachar",
            permissionsMeta: {
              resource: "logistica_despacho",
              action: "CREATE",
            },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);
    });

    it("3) CONDUCTOR HTTP 403 en Bandeja Omnicanal o Finanzas", () => {
      const rolesOmni = new RolesGuard(
        mockCtx({
          role: "conductor",
          path: "/api/v1/recepcion/omnicanal/inbox",
          rolesMeta: ["recepcionista"],
        }).reflector as never,
      );
      expect(() =>
        rolesOmni.canActivate(
          mockCtx({
            role: "conductor",
            path: "/api/v1/recepcion/omnicanal/inbox",
            rolesMeta: ["recepcionista"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      const pathOmni = new PermissionsGuard(
        mockCtx({
          role: "conductor",
          path: "/api/v1/recepcion/omnicanal/inbox",
        }).reflector as never,
      );
      expect(() =>
        pathOmni.canActivate(
          mockCtx({
            role: "conductor",
            path: "/api/v1/recepcion/omnicanal/inbox",
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new ModulesGuard(
          mockCtx({
            role: "conductor",
            path: "/finanzas/reportes",
            modulesMeta: ["tesoreria", "finanzas"],
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "conductor",
            path: "/finanzas/reportes",
            modulesMeta: ["tesoreria", "finanzas"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);
    });

    it("4) LIDER_TI HTTP 403 en /api/v1/finanzas y /api/v1/audit-forensic", () => {
      const role = normalizeRole("LIDER_TI");
      expect(role).toBe("lider_ti");
      expect(hasPermission(role, "usuarios_roles", "CREATE")).toBe(true);
      expect(hasPermission(role, "integraciones", "DELETE")).toBe(true);
      expect(hasPermission(role, "helpdesk_ti", "UPDATE")).toBe(true);
      expect(hasPermission(role, "infra_monitoreo", "READ")).toBe(true);
      expect(hasPermission(role, "infra_monitoreo", "UPDATE")).toBe(false);
      expect(hasPermission(role, "finanzas", "READ")).toBe(false);
      expect(hasPermission(role, "audit_forense", "READ")).toBe(false);
      expect(hasPermission(role, "contabilidad", "READ")).toBe(false);

      expect(isPathDeniedForRole("lider_ti", "/api/v1/finanzas/reportes")).toBe(
        true,
      );
      expect(isPathDeniedForRole("lider_ti", "/api/v1/audit-forensic")).toBe(
        true,
      );
      expect(isPathDeniedForRole("tecnologia", "/revisoria/audit-trail")).toBe(
        true,
      );

      expect(() =>
        new RolesGuard(
          mockCtx({
            role: "lider_ti",
            path: "/api/v1/finanzas/reportes",
            rolesMeta: ["tesoreria", "finanzas", "director_financiero"],
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "lider_ti",
            path: "/api/v1/finanzas/reportes",
            rolesMeta: ["tesoreria", "finanzas", "director_financiero"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "lider_ti",
            path: "/api/v1/finanzas/payments",
            permissionsMeta: { resource: "finanzas", action: "READ" },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "lider_ti",
            path: "/api/v1/finanzas/payments",
            permissionsMeta: { resource: "finanzas", action: "READ" },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new ModulesGuard(
          mockCtx({
            role: "LIDER_TI",
            path: "/api/v1/audit-forensic",
            modulesMeta: ["revisoria_fiscal"],
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "LIDER_TI",
            path: "/api/v1/audit-forensic",
            modulesMeta: ["revisoria_fiscal"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "lider_ti",
            path: "/api/v1/audit-forensic",
            permissionsMeta: { resource: "audit_forense", action: "READ" },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "lider_ti",
            path: "/api/v1/audit-forensic",
            permissionsMeta: { resource: "audit_forense", action: "READ" },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);
    });

    it("5) GESTOR_DOCUMENTAL HTTP 403 en nómina/salarios y CREATE contratos", () => {
      const role = normalizeRole("GESTOR_DOCUMENTAL");
      expect(role).toBe("gestor_documental");
      expect(hasPermission(role, "archivo_digital", "CREATE")).toBe(true);
      expect(hasPermission(role, "custodia_fisica", "UPDATE")).toBe(true);
      expect(hasPermission(role, "inventario_papeleria", "DELETE")).toBe(true);
      expect(hasPermission(role, "tramites", "READ")).toBe(true);
      expect(hasPermission(role, "contratos", "READ")).toBe(true);
      expect(hasPermission(role, "contratos", "CREATE")).toBe(false);
      expect(hasPermission(role, "contratos", "UPDATE")).toBe(false);
      expect(hasPermission(role, "nomina", "CREATE")).toBe(false);
      expect(hasPermission(role, "nomina", "UPDATE")).toBe(false);
      expect(hasPermission(role, "personal", "UPDATE")).toBe(false);
      expect(hasPermission(role, "finanzas", "READ")).toBe(false);
      expect(hasPermission(role, "taller", "READ")).toBe(false);
      expect(hasPermission(role, "logistica_despacho", "CREATE")).toBe(false);

      expect(isPathDeniedForRole(role, "/api/v1/rrhh/payroll/calculate")).toBe(
        true,
      );
      expect(isPathDeniedForRole(role, "/taller/work-orders")).toBe(true);
      expect(isPathDeniedForRole(role, "/api/v1/finanzas/reportes")).toBe(true);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "gestor_documental",
            path: "/api/v1/rrhh/payroll/calculate",
            permissionsMeta: { resource: "nomina", action: "CREATE" },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "gestor_documental",
            path: "/api/v1/rrhh/payroll/calculate",
            permissionsMeta: { resource: "nomina", action: "CREATE" },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "gestor_documental",
            path: "/api/v1/rrhh/employees/emp-1",
            permissionsMeta: { resource: "personal", action: "UPDATE" },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "gestor_documental",
            path: "/api/v1/rrhh/employees/emp-1",
            permissionsMeta: { resource: "personal", action: "UPDATE" },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "gestor_documental",
            path: "/comercial/contracts",
            permissionsMeta: { resource: "contratos", action: "CREATE" },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "gestor_documental",
            path: "/comercial/contracts",
            permissionsMeta: { resource: "contratos", action: "CREATE" },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new RolesGuard(
          mockCtx({
            role: "gestor_documental",
            path: "/comercial/contracts",
            rolesMeta: [
              "gestor_comercial",
              "coordinador_comercial",
              "org_admin",
            ],
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "gestor_documental",
            path: "/comercial/contracts",
            rolesMeta: [
              "gestor_comercial",
              "coordinador_comercial",
              "org_admin",
            ],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);
    });

    it("6) AUXILIAR_CONTABLE HTTP 403 en /api/v1/tesoreria/dispersar y /api/v1/contabilidad/puc", () => {
      const role = normalizeRole("AUXILIAR_CONTABLE");
      expect(role).toBe("auxiliar_contable");
      expect(hasPermission(role, "cxp_proveedores", "CREATE")).toBe(true);
      expect(hasPermission(role, "legalizacion_gastos", "UPDATE")).toBe(true);
      expect(hasPermission(role, "conciliacion_bancaria", "CREATE")).toBe(true);
      expect(hasPermission(role, "facturacion_clientes", "READ")).toBe(true);
      expect(hasPermission(role, "puc", "READ")).toBe(false);
      expect(hasPermission(role, "puc", "CREATE")).toBe(false);
      expect(hasPermission(role, "tesoreria_dispersion", "CREATE")).toBe(false);
      expect(hasPermission(role, "finanzas", "READ")).toBe(false);

      expect(isPathDeniedForRole(role, "/api/v1/tesoreria/dispersar")).toBe(
        true,
      );
      expect(isPathDeniedForRole(role, "/api/v1/contabilidad/puc")).toBe(true);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "auxiliar_contable",
            path: "/api/v1/tesoreria/dispersar",
            permissionsMeta: {
              resource: "tesoreria_dispersion",
              action: "CREATE",
            },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "auxiliar_contable",
            path: "/api/v1/tesoreria/dispersar",
            permissionsMeta: {
              resource: "tesoreria_dispersion",
              action: "CREATE",
            },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new RolesGuard(
          mockCtx({
            role: "auxiliar_contable",
            path: "/api/v1/tesoreria/dispersar",
            rolesMeta: ["tesoreria", "director_financiero"],
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "auxiliar_contable",
            path: "/api/v1/tesoreria/dispersar",
            rolesMeta: ["tesoreria", "director_financiero"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "auxiliar_contable",
            path: "/api/v1/contabilidad/puc",
            permissionsMeta: { resource: "puc", action: "CREATE" },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "auxiliar_contable",
            path: "/api/v1/contabilidad/puc",
            permissionsMeta: { resource: "puc", action: "CREATE" },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);
    });

    it("7) GESTOR_CONTABLE HTTP 403 en despacho operaciones y dispersión tesorería", () => {
      const role = normalizeRole("GESTOR_CONTABLE");
      expect(role).toBe("gestor_contable");
      expect(hasPermission(role, "puc", "DELETE")).toBe(true);
      expect(hasPermission(role, "facturacion_electronica", "CREATE")).toBe(true);
      expect(hasPermission(role, "gastos_ruta", "UPDATE")).toBe(true);
      expect(hasPermission(role, "nomina", "READ")).toBe(true);
      expect(hasPermission(role, "taller", "READ")).toBe(true);
      expect(hasPermission(role, "finanzas", "READ")).toBe(true);
      expect(hasPermission(role, "tesoreria_dispersion", "CREATE")).toBe(false);
      expect(hasPermission(role, "logistica_despacho", "CREATE")).toBe(false);

      expect(
        isPathDeniedForRole(role, "/logistica/servicios/despachar"),
      ).toBe(true);
      expect(isPathDeniedForRole(role, "/api/v1/tesoreria/dispersar")).toBe(
        true,
      );

      expect(() =>
        new RolesGuard(
          mockCtx({
            role: "gestor_contable",
            path: "/logistica/servicios/despachar",
            rolesMeta: ["gestor_operativo", "centro_control"],
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "gestor_contable",
            path: "/logistica/servicios/despachar",
            rolesMeta: ["gestor_operativo", "centro_control"],
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);

      expect(() =>
        new PermissionsGuard(
          mockCtx({
            role: "gestor_contable",
            path: "/api/v1/tesoreria/dispersar",
            permissionsMeta: {
              resource: "tesoreria_dispersion",
              action: "CREATE",
            },
          }).reflector as never,
        ).canActivate(
          mockCtx({
            role: "gestor_contable",
            path: "/api/v1/tesoreria/dispersar",
            permissionsMeta: {
              resource: "tesoreria_dispersion",
              action: "CREATE",
            },
          }).ctx as never,
        ),
      ).toThrow(RBAC_FORBIDDEN_MESSAGE);
    });
  });
});
