import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { ComercialModule } from "../comercial/comercial.module";
import { LogisticaOpsService } from "./logistica-ops.service";
import { ServiciosController } from "./servicios/servicios.controller";
import { ConductoresController } from "./conductores/conductores.controller";
import { LogisticaRelojController } from "./logistica-reloj.controller";

/**
 * INRETRANS OS — Módulo Logística (submenú):
 *  1. /logistica/servicios  — Programación + Tracking GPS
 *  2. /logistica/conductores — Disponibilidad, relevos y nómina de extras
 *
 * Orquesta Hard-Stops vía ComplianceGate (M04/M12/M07) y Comercial (M03).
 */
@Module({
  imports: [
    AuthModule,
    forwardRef(() => LogisticsModule),
    forwardRef(() => ComercialModule),
  ],
  controllers: [
    LogisticaRelojController,
    ServiciosController,
    ConductoresController,
  ],
  providers: [LogisticaOpsService],
  exports: [LogisticaOpsService],
})
export class LogisticaModule {}
