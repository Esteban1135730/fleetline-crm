import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { YardAccessService } from "./yard-access.service";
import { PhysicalInspectionService } from "./physical-inspection.service";
import {
  LprCheckSchema,
  WashCompleteSchema,
  YardAccessLogSchema,
  YardInspectionSchema,
  YardMoveSchema,
} from "./dto/patio.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const PATIO_ROLES = [
  "coordinador_patio",
  "COORDINADOR_PATIO",
  "auxiliar_patio",
  "AUXILIAR_PATIO",
  "director_operativo",
  "gerente_general",
  "sub_gerente",
  "SUB_GERENTE",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Módulo 21 / 21.1 — Smart Yard & Talanquera LPR
 * Prefijos: /patio · /api/v1/patio
 */
@Controller(["patio", "api/v1/patio"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("parqueadero")
@Roles(...PATIO_ROLES)
export class PatioController {
  constructor(
    private access: YardAccessService,
    private inspections: PhysicalInspectionService,
  ) {}

  @Get("coordinador/dashboard")
  @Permissions("patio_acceso", "READ")
  coordDash(@Req() req: AuthReq) {
    return this.access.coordinadorDashboard(req.user.organizationId);
  }

  @Get("auxiliar/yard-app")
  @Permissions("patio_lavado", "READ")
  yardApp(@Req() req: AuthReq) {
    return this.access.auxiliarYardApp(req.user.organizationId);
  }

  @Post("talanquera/lpr-check")
  @Permissions("patio_acceso", "CREATE")
  lprCheck(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LprCheckSchema.parse(body ?? {});
    return this.access.lprCheck(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post("parqueo/lifo")
  @Permissions("patio_parqueo", "CREATE")
  async lifo(@Req() req: AuthReq, @Body() body: unknown) {
    const raw = (body ?? {}) as {
      plate?: string;
      scheduledDepartAt?: string | Date;
    };
    if (!raw.plate || !raw.scheduledDepartAt) {
      return { error: "plate y scheduledDepartAt requeridos" };
    }
    return this.access.assignParkingLifo(
      req.user.organizationId,
      raw.plate,
      new Date(raw.scheduledDepartAt),
    );
  }

  @Post("yard-move")
  @Permissions("patio_parqueo", "UPDATE")
  yardMove(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = YardMoveSchema.parse(body ?? {});
    return this.access.yardMove(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post("lavado/completar")
  @Permissions("patio_lavado", "UPDATE")
  completeWash(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = WashCompleteSchema.parse(body ?? {});
    return this.access.completeWash(
      req.user.organizationId,
      dto.washJobId,
      dto.notes,
    );
  }

  @Post("access-log")
  @Permissions("patio_acceso", "CREATE")
  accessLog(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = YardAccessLogSchema.parse(body ?? {});
    return this.access.recordAccess(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post("inspections")
  @Permissions("patio_acceso", "CREATE")
  createInspection(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = YardInspectionSchema.parse(body ?? {});
    return this.inspections.createInspection(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("current-inventory")
  @Permissions("patio_parqueo", "READ")
  currentInventory(@Req() req: AuthReq) {
    return this.access.currentInventory(req.user.organizationId);
  }
}
