import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { NocMonitoringService } from "./noc-monitoring.service";
import { KafkaDlqMonitor } from "./kafka-dlq.monitor";
import { SttsEngineService } from "./stts-engine.service";
import {
  DlqReplaySchema,
  SynthesizeSchema,
  SystemLogsQuerySchema,
  TranscribeSchema,
} from "./dto/ti.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("ti")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("tecnologia_ti", "ti", "sistemas")
export class TiController {
  constructor(
    private noc: NocMonitoringService,
    private dlq: KafkaDlqMonitor,
    private stts: SttsEngineService,
  ) {}

  @Get("noc/health")
  nocHealth(@Req() req: AuthReq) {
    return this.noc.health(req.user.organizationId);
  }

  @Get("system-logs")
  systemLogs(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = SystemLogsQuerySchema.parse(query ?? {});
    return this.noc.listSystemLogs(req.user.organizationId, parsed);
  }

  @Get("kafka/dlq")
  listDlq(@Req() req: AuthReq) {
    return this.dlq.listPending(req.user.organizationId);
  }

  @Post("kafka/dlq/replay")
  replayDlq(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DlqReplaySchema.parse(body ?? {});
    return this.dlq.replay(req.user.organizationId, dto);
  }

  @Post("stts/transcribe")
  transcribe(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = TranscribeSchema.parse(body ?? {});
    return this.stts.transcribe(req.user.organizationId, dto);
  }

  @Post("stts/synthesize")
  synthesize(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SynthesizeSchema.parse(body ?? {});
    return this.stts.synthesize(req.user.organizationId, dto);
  }
}
