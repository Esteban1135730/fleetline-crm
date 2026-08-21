import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { SecureUploadsController } from "./secure-uploads.controller";
import { TurnstileService } from "./turnstile.service";

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: "default",
        ttl: 60_000,
        limit: 180,
      },
    ]),
  ],
  controllers: [SecureUploadsController],
  providers: [
    TurnstileService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [TurnstileService, ThrottlerModule],
})
export class SecurityModule {}
