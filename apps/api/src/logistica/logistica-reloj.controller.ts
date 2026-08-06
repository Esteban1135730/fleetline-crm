import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { LogisticaOpsService } from "./logistica-ops.service";

/** Reloj servidor de alta precisión — compartido por ambos submenús */
@Controller("logistica")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("logistica")
export class LogisticaRelojController {
  constructor(private ops: LogisticaOpsService) {}

  @Get("reloj")
  reloj() {
    return this.ops.serverClock();
  }
}
