import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ComplianceGateService } from "./compliance-gate.service";

/**
 * Hard-Stop legal: intercepta creación / despacho de viajes.
 * Responde HTTP 422 con JSON detallado de violaciones.
 */
@Injectable()
export class ComplianceGuard implements CanActivate {
  constructor(private gate: ComplianceGateService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: { organizationId: string };
      body?: Record<string, unknown>;
      params?: Record<string, string>;
    }>();

    const organizationId = req.user?.organizationId;
    const body = req.body ?? {};

    const vehicleId =
      (typeof body.vehicleId === "string" && body.vehicleId) || undefined;
    const driverId =
      (typeof body.driverId === "string" && body.driverId) || undefined;

    // Sin unidad/conductor aún (borrador) → no aplica Hard-Stop
    if (!organizationId || !vehicleId || !driverId) {
      return true;
    }

    const departRaw =
      (typeof body.departAt === "string" && body.departAt) ||
      (typeof body.scheduledAt === "string" && body.scheduledAt) ||
      undefined;
    const departAt = departRaw ? new Date(departRaw) : new Date();

    const path =
      (typeof (req as { url?: string }).url === "string"
        ? (req as { url: string }).url
        : "") || "";
    const isDispatchRoute = /\/trips\/[^/]+\/dispatch/i.test(path);

    const requireFuec =
      body.requireFuec === true ||
      body.dispatch === true ||
      isDispatchRoute;

    const result = await this.gate.evaluate({
      organizationId,
      vehicleId,
      driverId,
      departAt,
      requireFuec,
    });

    if (!result.ok) {
      throw new UnprocessableEntityException({
        error: "COMPLIANCE_GATE_BLOCKED",
        message:
          "Hard-Stop: el viaje no puede despacharse por incumplimiento normativo",
        blocks: result.violations.map((v) => v.code),
        violations: result.violations,
      });
    }

    return true;
  }
}
