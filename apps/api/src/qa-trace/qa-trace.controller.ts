import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { QaAllowlistGuard } from "./qa-allowlist.guard";
import { QaTraceService } from "./qa-trace.service";
import {
  QaEventIngestSchema,
  QaSessionsQuerySchema,
} from "./dto/qa-trace.dto";
import { clientIp, isQaTraceEnabled } from "./qa-trace.util";
import { PrismaService } from "../prisma/prisma.service";

type AuthReq = {
  user: {
    userId: string;
    email: string;
    organizationId: string;
  };
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

@Controller(["qa-trace", "api/v1/qa-trace"])
@UseGuards(JwtAuthGuard)
export class QaTraceController {
  constructor(
    private qa: QaTraceService,
    private prisma: PrismaService,
  ) {}

  /** Beacon — cualquier usuario autenticado en staging/pruebas. */
  @Post("events")
  async ingest(@Req() req: AuthReq, @Body() body: unknown) {
    if (!isQaTraceEnabled()) {
      return { ok: false, disabled: true };
    }
    const dto = QaEventIngestSchema.parse(body ?? {});
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true, email: true },
    });
    const ua = String(req.headers?.["user-agent"] || "") || null;
    return this.qa.ingest(
      {
        userId: req.user.userId,
        email: user?.email || req.user.email,
        name: user?.name,
        organizationId: req.user.organizationId,
      },
      dto,
      clientIp(req),
      ua,
    );
  }

  /** Panel — solo allowlist (esteban*). */
  @Get("overview")
  @UseGuards(QaAllowlistGuard)
  overview() {
    return this.qa.overview();
  }

  @Get("sessions")
  @UseGuards(QaAllowlistGuard)
  sessions(@Query() query: Record<string, string>) {
    const dto = QaSessionsQuerySchema.parse(query ?? {});
    return this.qa.listSessions(dto);
  }

  @Get("sessions/:id")
  @UseGuards(QaAllowlistGuard)
  sessionDetail(@Param("id") id: string) {
    return this.qa.sessionDetail(id);
  }
}
