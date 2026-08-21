import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "@fsg/db";

const SLOW_MS = Number(process.env.PRISMA_SLOW_QUERY_MS || 500);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly log = new Logger("Prisma");

  constructor() {
    super({
      log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
      ],
    });
  }

  async onModuleInit() {
    // Monitor de consultas lentas (pilar 8)
    // @ts-expect-error Prisma event typing
    this.$on("query", (e: { duration: number; query: string }) => {
      if (e.duration >= SLOW_MS) {
        this.log.warn(
          `Slow query ${e.duration}ms — ${String(e.query).slice(0, 180)}`,
        );
      }
    });
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
