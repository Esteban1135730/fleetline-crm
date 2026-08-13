import { Module } from "@nestjs/common";
import { CfoModule } from "./cfo/cfo.module";

@Module({
  imports: [CfoModule],
  exports: [CfoModule],
})
export class FinanzasModule {}
