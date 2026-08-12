import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PaymentScheduleStatus } from "@fsg/db";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { TesoreriaService } from "./tesoreria.service";
import { RodamientosService } from "./rodamientos.service";
import { MfaTreasuryGuard } from "./mfa.treasury.guard";
import {
  DisbursePaymentsDto,
  LiquidateRodamientosDto,
} from "./dto/tesoreria.dto";

@Controller(["tesoreria", "finanzas", "api/v1/finanzas", "api/v1/tesoreria"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("tesoreria", "finanzas")
@Roles(
  "tesoreria",
  "finanzas",
  "director_financiero",
  "org_admin",
  "platform_master",
  "superadmin",
  "gerente_general",
  "gestor_contable",
)
@Permissions("finanzas", "READ")
export class TesoreriaController {
  constructor(
    private tesoreria: TesoreriaService,
    private rodamientos: RodamientosService,
  ) {}

  @Get("reportes")
  reportes(@Req() req: { user: { organizationId: string } }) {
    return {
      organizationId: req.user.organizationId,
      scope: "finanzas",
      message: "Reportes financieros · acceso autorizado",
    };
  }

  @Get("payments/schedules")
  schedules(
    @Req() req: { user: { organizationId: string } },
    @Query("status") status?: PaymentScheduleStatus,
  ) {
    return this.tesoreria.listSchedules(req.user.organizationId, status);
  }

  @Post("payments/disburse")
  @Permissions("tesoreria_dispersion", "CREATE")
  @UseGuards(MfaTreasuryGuard)
  disburse(
    @Req()
    req: {
      user: { organizationId: string; userId: string; email?: string };
    },
    @Body() body: DisbursePaymentsDto,
  ) {
    return this.tesoreria.disburse(
      req.user.organizationId,
      req.user.userId,
      req.user.email,
      body,
    );
  }

  /** Alias RBAC: POST /api/v1/tesoreria/dispersar */
  @Post("dispersar")
  @Permissions("tesoreria_dispersion", "CREATE")
  @UseGuards(MfaTreasuryGuard)
  dispersar(
    @Req()
    req: {
      user: { organizationId: string; userId: string; email?: string };
    },
    @Body() body: DisbursePaymentsDto,
  ) {
    return this.disburse(req, body);
  }

  /** Cruce de recaudo CxC con referencia Host-to-Host */
  @Post("cartera/cruzar")
  @Permissions("tesoreria_dispersion", "UPDATE")
  cruzarCartera(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Body() body: { invoiceIds: string[]; bankRef: string },
  ) {
    return this.tesoreria.cruzarCartera(
      req.user.organizationId,
      req.user.userId,
      body,
    );
  }

  @Get("rodamientos")
  listRodamientos(@Req() req: { user: { organizationId: string } }) {
    return this.rodamientos.list(req.user.organizationId);
  }

  @Post("rodamientos/liquidate")
  @Permissions("tesoreria_dispersion", "UPDATE")
  liquidateRodamientos(
    @Req() req: { user: { organizationId: string; userId: string } },
    @Body() body: LiquidateRodamientosDto,
  ) {
    return this.rodamientos.liquidate(
      req.user.organizationId,
      req.user.userId,
      body,
    );
  }
}
