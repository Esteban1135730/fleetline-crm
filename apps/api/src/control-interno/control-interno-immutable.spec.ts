import { ControlInternoController } from "./control-interno.controller";
import { assertAuditLogApiImmutable } from "./dto/control-interno.dto";

describe("AuditLog API immutability — sin UPDATE/DELETE expuestos", () => {
  it("el controller no declara métodos de mutación sobre audit log", () => {
    const result = assertAuditLogApiImmutable(
      ControlInternoController.prototype,
    );
    expect(result.ok).toBe(true);
    expect(result.forbiddenMethods).toEqual([]);
  });

  it("solo expone lectura GET audit-log (prototype)", () => {
    const proto = ControlInternoController.prototype as unknown as Record<
      string,
      unknown
    >;
    expect(typeof proto.auditLog).toBe("function");
    expect(proto.updateAuditLog).toBeUndefined();
    expect(proto.deleteAuditLog).toBeUndefined();
    expect(proto.patchAuditLog).toBeUndefined();
    expect(proto.removeAuditLog).toBeUndefined();
  });

  it("listado de métodos del controller excluye mutadores de AuditLog", () => {
    const methods = Object.getOwnPropertyNames(
      ControlInternoController.prototype,
    ).filter((n) => n !== "constructor");
    const mutators = methods.filter((m) =>
      /(update|delete|remove|patch|put|destroy).*audit|audit.*(update|delete|remove|patch|put|destroy)/i.test(
        m,
      ),
    );
    expect(mutators).toEqual([]);
    expect(methods).toContain("auditLog");
    expect(methods).toContain("crearHallazgo");
    expect(methods).toContain("smartAudit");
  });
});
