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
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { AccountingLedgerService } from "./accounting-ledger.service";

type AuthReq = { user: { organizationId: string } };

/** Alias `accounting` = contrato CRM web; `contabilidad` = ruta canónica SSOT. */
@Controller(["contabilidad", "accounting", "api/v1/contabilidad"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("contabilidad")
@Roles(
  "gestor_contable",
  "director_financiero",
  "org_admin",
  "platform_master",
  "gerente_general",
  "tesoreria",
  "auxiliar_contable_taller",
)
export class ContabilidadController {
  constructor(private ledger: AccountingLedgerService) {}

  @Get("trial-balance")
  @Permissions("puc", "READ")
  trialBalance(@Req() req: AuthReq) {
    return this.ledger.trialBalance(req.user.organizationId);
  }

  @Get("journal-entries")
  @Permissions("contabilidad", "READ")
  journalEntries(@Req() req: AuthReq) {
    return this.ledger.listJournalEntries(req.user.organizationId);
  }

  @Get("journal")
  @Permissions("contabilidad", "READ")
  journalUi(@Req() req: AuthReq) {
    return this.ledger.listJournalForUi(req.user.organizationId);
  }

  @Get("accounts")
  @Permissions("puc", "READ")
  async accounts(@Req() req: AuthReq) {
    await this.ledger.ensureChartOfAccounts(req.user.organizationId);
    return this.ledger.listAccounts(req.user.organizationId);
  }

  @Post("accounts")
  @Permissions("puc", "CREATE")
  createAccount(
    @Req() req: AuthReq,
    @Body() body: { code: string; name: string; type: string },
  ) {
    return this.ledger.createAccount(req.user.organizationId, body);
  }

  @Post("journal")
  @Permissions("contabilidad", "CREATE")
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
  @Permissions("contabilidad", "UPDATE")
  voidJournal(@Req() req: AuthReq, @Param("id") id: string) {
    return this.ledger.voidEntry(req.user.organizationId, id);
  }
}
