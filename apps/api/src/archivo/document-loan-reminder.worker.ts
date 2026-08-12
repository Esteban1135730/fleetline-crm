import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ArchivoOpsService } from "./archivo-ops.service";

@Injectable()
export class DocumentLoanReminderWorker {
  private readonly logger = new Logger(DocumentLoanReminderWorker.name);

  constructor(private ops: ArchivoOpsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async handleDailyReminders() {
    this.logger.log("[CRON] Recordatorio préstamos archivo — inicio");
    const summary = await this.ops.remindOverdueLoans();
    this.logger.log(
      `[CRON] Recordatorio préstamos — fin: reminded=${summary.reminded}`,
    );
    return summary;
  }
}
