import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ExecutiveKpiService } from "./executive-kpi.service";

@Injectable()
export class PresidenciaService {
  constructor(
    private prisma: PrismaService,
    private kpis: ExecutiveKpiService,
  ) {}

  async canvasKpis(organizationId: string, userId: string) {
    const canvas = await this.kpis.buildCanvasKpis(organizationId);

    await this.prisma.executiveQueryLog.create({
      data: {
        organizationId,
        userId,
        utterance: "GET /presidencia/canvas-kpis",
        generatedSql: null,
        answerText: JSON.stringify({
          source: "FoundersCanvas",
          modules: ["04", "06", "08", "09", "10"],
          generatedAt: canvas.generatedAt,
          killSwitchBlockedPct: canvas.killSwitch.blockedPct,
          atRiskAmount: canvas.cashFlow.atRiskAmount,
        }),
      },
    });

    return {
      canvas: "Founder's Canvas",
      mode: "DIRECTIVE_READ_ONLY",
      ...canvas,
    };
  }
}
