import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { VisitBoardStatus } from "@fsg/db";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { RecepcionService } from "./recepcion.service";
import {
  ConvertLeadSchema,
  QuickPqrsSchema,
  RadarQuerySchema,
  RecepcionCheckInSchema,
} from "./dto/recepcion.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

@Controller(["recepcion", "api/v1/recepcion"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("call_center", "recepcion", "atencion")
@Roles(
  "recepcionista",
  "recepcion",
  "atencion",
  "RECEPCIONISTA",
  "RECEPCION",
  "org_admin",
  "platform_master",
  "gerente_general",
  "gestor_operativo",
  "centro_control",
  "gestor_comercial",
)
export class RecepcionController {
  constructor(private recepcion: RecepcionService) {}

  @Get("metrics/daily")
  @Permissions("recepcion", "READ")
  dailyMetrics(@Req() req: AuthReq) {
    return this.recepcion.dailyMetrics(req.user.organizationId);
  }

  @Get("visitas/lookup")
  @Permissions("visitas", "READ")
  lookup(@Req() req: AuthReq, @Query("document") document?: string) {
    return this.recepcion.lookupByDocument(
      req.user.organizationId,
      document || "",
    );
  }

  @Get("visitas/today")
  @Permissions("visitas", "READ")
  today(
    @Req() req: AuthReq,
    @Query("boardStatus") boardStatus?: string,
  ) {
    const status = boardStatus
      ? (boardStatus.toUpperCase() as VisitBoardStatus)
      : undefined;
    return this.recepcion.listTodayVisitors(req.user.organizationId, status);
  }

  /** Alias RBAC: POST /recepcion/visitas */
  @Post("visitas")
  @Permissions("visitas", "CREATE")
  checkInAlias(@Req() req: AuthReq, @Body() body: unknown) {
    return this.checkIn(req, body);
  }

  @Post("visitas/check-in")
  @Permissions("visitas", "CREATE")
  checkIn(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = RecepcionCheckInSchema.parse(body ?? {});
    return this.recepcion.checkIn(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Patch("visitas/:id")
  @Permissions("visitas", "UPDATE")
  updateVisit(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: { boardStatus?: string; badgeRfid?: string },
  ) {
    return this.recepcion.updateVisitorBoard(req.user.organizationId, id, {
      boardStatus: body.boardStatus
        ? (body.boardStatus.toUpperCase() as VisitBoardStatus)
        : undefined,
      badgeRfid: body.badgeRfid,
    });
  }

  @Get("rutas/radar-status")
  @Permissions("torre_rutas", "READ")
  radar(@Req() req: AuthReq, @Query() query: Record<string, string>) {
    const parsed = RadarQuerySchema.parse(query ?? {});
    return this.recepcion.radarStatus(req.user.organizationId, parsed);
  }

  @Get("omnicanal/inbox")
  @Permissions("omnicanal", "READ")
  inbox(@Req() req: AuthReq) {
    return this.recepcion.omnicanalInbox(req.user.organizationId);
  }

  /** Alias RBAC: POST /recepcion/crm/leads */
  @Post("crm/leads")
  @Permissions("crm_comercial", "CREATE")
  convertLeadAlias(@Req() req: AuthReq, @Body() body: unknown) {
    return this.convertLead(req, body);
  }

  @Post("omnicanal/convert-lead")
  @Permissions("crm_comercial", "CREATE")
  convertLead(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ConvertLeadSchema.parse(body ?? {});
    return this.recepcion.convertLead(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("pqrs/quick-ticket")
  @Permissions("qhse_pqrs", "CREATE")
  quickTicket(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = QuickPqrsSchema.parse(body ?? {});
    return this.recepcion.quickPqrs(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }
}
