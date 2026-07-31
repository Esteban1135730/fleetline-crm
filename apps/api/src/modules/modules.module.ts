import { Module, forwardRef } from "@nestjs/common";
import { ModulesController } from "./modules.controller";
import { ModulesService } from "./modules.service";
import { LogisticsModule } from "../logistics/logistics.module";

@Module({
  imports: [forwardRef(() => LogisticsModule)],
  controllers: [ModulesController],
  providers: [ModulesService],
})
export class ModulesModule {}
