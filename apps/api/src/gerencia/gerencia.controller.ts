import {
  Controller,
  Get,
  Req,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { DirectiveReadOnlyGuard } from "../presidencia/directive-readonly.guard";
import { DirectiveReadOnlyInterceptor } from "../presidencia/directive-readonly.interceptor";
import { GerenciaService } from "./gerencia.service";

@Controller("gerencia")
@UseGuards(JwtAuthGuard, ModulesGuard, DirectiveReadOnlyGuard)
@UseInterceptors(DirectiveReadOnlyInterceptor)
@RequireModule("gerencia")
export class GerenciaController {
  constructor(private gerencia: GerenciaService) {}

  @Get("strategy-hub")
  strategyHub(
    @Req()
    req: {
      user: { userId: string; organizationId: string };
    },
  ) {
    return this.gerencia.strategyHub(
      req.user.organizationId,
      req.user.userId,
    );
  }
}
