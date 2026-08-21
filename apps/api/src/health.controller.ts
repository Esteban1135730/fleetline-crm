import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "./prisma/prisma.service";
import { Public } from "./security/public.decorator";

@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    let db: "ok" | "error" = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "error";
    }
    return {
      status: db === "ok" ? "ok" : "degraded",
      service: "fsg-api",
      db,
      ts: new Date().toISOString(),
    };
  }
}
