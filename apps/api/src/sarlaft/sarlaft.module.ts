import { Module } from "@nestjs/common";
import { SarlaftGuardService } from "./sarlaft-guard.service";

@Module({
  providers: [SarlaftGuardService],
  exports: [SarlaftGuardService],
})
export class SarlaftModule {}
