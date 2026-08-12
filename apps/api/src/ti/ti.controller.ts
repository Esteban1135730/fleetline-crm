import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { NocMonitoringService } from "./noc-monitoring.service";
import { KafkaDlqMonitor } from "./kafka-dlq.monitor";
import { SttsEngineService } from "./stts-engine.service";
import { TiOpsService } from "./ti-ops.service";
import {
  DlqReplaySchema,
  HelpdeskTicketSchema,
  MdmPairQrSchema,
  OnboardingLinkSchema,
  SynthesizeSchema,
  SystemLogsQuerySchema,
  TranscribeSchema,
} from "./dto/ti.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const TI_ROLES = [
  "lider_ti",
  "tecnologia",
  "sistemas",
  "LIDER_TI",
  "TECNOLOGIA",
  "org_admin",
  "platform_master",
  "gerente_general",
] as const;

@Controller(["ti", "api/v1/ti"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("tecnologia_ti", "ti", "sistemas")
@Roles(...TI_ROLES)
export class TiController {
  constructor(
    private noc: NocMonitoringService,
    private dlq: KafkaDlqMonitor,
    private stts: SttsEngineService,
    private ops: TiOpsService,
  ) {}

  /** POST /api/v1/ti/usuarios/onboarding-link */
  @Post("usuarios/onboarding-link")
  @Permissions("usuarios_roles", "CREATE")
  createOnboardingLink(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = OnboardingLinkSchema.parse(body ?? {});
    return this.ops.createOnboardingLink(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/ti/mdm/pair-qr */
  @Post("mdm/pair-qr")
  @Permissions("integraciones", "CREATE")
  createMdmPairQr(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = MdmPairQrSchema.parse(body ?? {});
    return this.ops.createMdmPairQr(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** GET /api/v1/ti/system-health */
  @Get("system-health")
  @Permissions("infra_monitoreo", "READ")
  systemHealth(@Req() req: AuthReq) {
    return this.ops.systemHealth(req.user.organizationId);
  }

  @Get("usuarios")
  @Permissions("usuarios_roles", "READ")
  listUsers(@Req() req: AuthReq) {
    return this.ops.listDashboardUsers(req.user.organizationId);
  }

  @Get("helpdesk/tickets")
  @Permissions("helpdesk_ti", "READ")
  listTickets(@Req() req: AuthReq) {
    return this.ops.listHelpdeskTickets(req.user.organizationId);
  }

  @Post("helpdesk/tickets")
  @Permissions("helpdesk_ti", "CREATE")
  createTicket(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = HelpdeskTicketSchema.parse(body ?? {});
    return this.ops.createHelpdeskTicket(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Get("noc/health")
  @Permissions("infra_monitoreo", "READ")
  nocHealth(@Req() req: AuthReq) {
    return this.noc.health(req.user.organizationId);
  }

  @Get("system-logs")
  @Permissions("infra_monitoreo", "READ")
  systemLogs(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = SystemLogsQuerySchema.parse(query ?? {});
    return this.noc.listSystemLogs(req.user.organizationId, parsed);
  }

  @Get("kafka/dlq")
  @Permissions("infra_monitoreo", "READ")
  listDlq(@Req() req: AuthReq) {
    return this.dlq.listPending(req.user.organizationId);
  }

  @Post("kafka/dlq/replay")
  @Permissions("integraciones", "UPDATE")
  replayDlq(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DlqReplaySchema.parse(body ?? {});
    return this.dlq.replay(req.user.organizationId, dto);
  }

  @Post("stts/transcribe")
  @Permissions("integraciones", "CREATE")
  transcribe(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = TranscribeSchema.parse(body ?? {});
    return this.stts.transcribe(req.user.organizationId, dto);
  }

  @Post("stts/synthesize")
  @Permissions("integraciones", "CREATE")
  synthesize(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SynthesizeSchema.parse(body ?? {});
    return this.stts.synthesize(req.user.organizationId, dto);
  }
}
