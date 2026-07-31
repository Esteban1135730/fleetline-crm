import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { AccountingLedgerService } from "./accounting-ledger.service";

type AuthReq = { user: { organizationId: string } };

/** Alias `accounting` = contrato CRM web; `contabilidad` = ruta canónica SSOT. */
@Controller(["contabilidad", "accounting"])
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("contabilidad")
export class ContabilidadController {
  constructor(private ledger: AccountingLedgerService) {}

  @Get("trial-balance")
  trialBalance(@Req() req: AuthReq) {
    return this.ledger.trialBalance(req.user.organizationId);
  }

  @Get("journal-entries")
  journalEntries(@Req() req: AuthReq) {
    return this.ledger.listJournalEntries(req.user.organizationId);
  }

  @Get("journal")
  journalUi(@Req() req: AuthReq) {
    return this.ledger.listJournalForUi(req.user.organizationId);
  }

  @Get("accounts")
  async accounts(@Req() req: AuthReq) {
    await this.ledger.ensureChartOfAccounts(req.user.organizationId);
    return this.ledger.listAccounts(req.user.organizationId);
  }

  @Post("accounts")
  createAccount(
    @Req() req: AuthReq,
    @Body() body: { code: string; name: string; type: string },
  ) {
    return this.ledger.createAccount(req.user.organizationId, body);
  }

  @Post("journal")
  createJournal(
    @Req() req: AuthReq,
    @Body()
    body: {
      description?: string;
      memo?: string;
      lines: { accountId: string; debit?: number; credit?: number }[];
    },
  ) {
    return this.ledger.createManualEntry(req.user.organizationId, body);
  }

  @Patch("journal/:id/void")
  voidJournal(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ledger.voidEntry(req.user.organizationId, id);
  }
}
