import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LogisticsModule } from "../logistics/logistics.module";
import { LogisticaModule } from "../logistica/logistica.module";
import { MobileChatController } from "./mobile-chat.controller";
import { MobileChatService } from "./mobile-chat.service";
import { MobileServiciosController } from "./mobile-servicios.controller";
import { MobileTripControlService } from "./mobile-trip-control.service";

@Module({
  imports: [
    AuthModule,
    forwardRef(() => LogisticsModule),
    forwardRef(() => LogisticaModule),
  ],
  controllers: [MobileServiciosController, MobileChatController],
  providers: [MobileTripControlService, MobileChatService],
  exports: [MobileTripControlService, MobileChatService],
})
export class MobileModule {}
