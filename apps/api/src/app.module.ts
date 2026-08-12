import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ScheduleModule } from "@nestjs/schedule";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CustomersModule } from "./customers/customers.module";
import { ComercialModule } from "./comercial/comercial.module";
import { LogisticsModule } from "./logistics/logistics.module";
import { LogisticaModule } from "./logistica/logistica.module";
import { NominaModule } from "./nomina/nomina.module";
import { MobileModule } from "./mobile/mobile.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { TramitesModule } from "./tramites/tramites.module";
import { ComprasModule } from "./compras/compras.module";
import { TesoreriaModule } from "./tesoreria/tesoreria.module";
import { TallerModule } from "./taller/taller.module";
import { FleetModule } from "./fleet/fleet.module";
import { FinanceModule } from "./finance/finance.module";
import { ContabilidadModule } from "./contabilidad/contabilidad.module";
import { RevisoriaModule } from "./revisoria/revisoria.module";
import { PresidenciaModule } from "./presidencia/presidencia.module";
import { GerenciaModule } from "./gerencia/gerencia.module";
import { RrhhModule } from "./rrhh/rrhh.module";
import { SarlaftModule } from "./sarlaft/sarlaft.module";
import { PatioModule } from "./patio/patio.module";
import { ArchivoModule } from "./archivo/archivo.module";
import { HqseModule } from "./hqse/hqse.module";
import { TiModule } from "./ti/ti.module";
import { PqrsModule } from "./pqrs/pqrs.module";
import { EscolarModule } from "./escolar/escolar.module";
import { PasajerosModule } from "./pasajeros/pasajeros.module";
import { ClientesB2bModule } from "./clientes-b2b/clientes-b2b.module";
import { UsersModule } from "./users/users.module";
import { PlatformModule } from "./platform/platform.module";
import { RecepcionModule } from "./recepcion/recepcion.module";
import { ModulesModule } from "./modules/modules.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    DashboardModule,
    CustomersModule,
    ComercialModule,
    LogisticsModule,
    LogisticaModule,
    NominaModule,
    MobileModule,
    NotificationsModule,
    TramitesModule,
    ComprasModule,
    TesoreriaModule,
    TallerModule,
    FleetModule,
    FinanceModule,
    ContabilidadModule,
    RevisoriaModule,
    PresidenciaModule,
    GerenciaModule,
    RrhhModule,
    SarlaftModule,
    PatioModule,
    ArchivoModule,
    HqseModule,
    TiModule,
    PqrsModule,
    EscolarModule,
    PasajerosModule,
    ClientesB2bModule,
    UsersModule,
    PlatformModule,
    RecepcionModule,
    ModulesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
