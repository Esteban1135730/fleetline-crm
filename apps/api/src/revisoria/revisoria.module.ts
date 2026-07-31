import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthModule } from "../auth/auth.module";
import { RevisoriaController } from "./revisoria.controller";
import { RevisoriaForenseService } from "./revisoria-forense.service";
import { RevisoriaReadOnlyGuard } from "./revisoria-readonly.guard";

@Module({
  imports: [AuthModule],
  controllers: [RevisoriaController],
  providers: [
    RevisoriaForenseService,
    RevisoriaReadOnlyGuard,
    { provide: APP_GUARD, useClass: RevisoriaReadOnlyGuard },
  ],
  exports: [RevisoriaForenseService, RevisoriaReadOnlyGuard],
})
export class RevisoriaModule {}
