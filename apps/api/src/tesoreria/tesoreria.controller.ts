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
import { TesoreriaService } from "./tesoreria.service";
import { RodamientosService } from "./rodamientos.service";
import { MfaTreasuryGuard } from "./mfa.treasury.guard";
import {
  DisbursePaymentsDto,
  LiquidateRodamientosDto,
} from "./dto/tesoreria.dto";

@Controller("tesoreria")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("tesoreria", "finanzas")
export class TesoreriaController {
  constructor(
    private tesoreria: TesoreriaService,
    private rodamientos: RodamientosService,
  ) {}

  @Get("payments/schedules")
  schedules(
    @Req() req: { user: { organizationId: string } },
    @Query("status") status?: PaymentScheduleStatus,
  ) {
    return this.tesoreria.listSchedules(req.user.organizationId, status);
  }

  @Post("payments/disburse")
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

  @Get("rodamientos")
  listRodamientos(@Req() req: { user: { organizationId: string } }) {
    return this.rodamientos.list(req.user.organizationId);
  }

  @Post("rodamientos/liquidate")
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
