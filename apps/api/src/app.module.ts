import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { CustomersModule } from "./customers/customers.module";
import { LogisticsModule } from "./logistics/logistics.module";
import { FleetModule } from "./fleet/fleet.module";
import { FinanceModule } from "./finance/finance.module";
import { AccountingModule } from "./accounting/accounting.module";
import { UsersModule } from "./users/users.module";
import { ModulesModule } from "./modules/modules.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    DashboardModule,
    CustomersModule,
    LogisticsModule,
    FleetModule,
    FinanceModule,
    AccountingModule,
    UsersModule,
    ModulesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
