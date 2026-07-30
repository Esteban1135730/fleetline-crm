import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { AccountingService } from "./accounting.service";

@Controller("accounting")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("contabilidad")
export class AccountingController {
  constructor(private service: AccountingService) {}

  @Get("accounts")
  accounts(@Req() req: { user: { organizationId: string } }) {
    return this.service.listAccounts(req.user.organizationId);
  }

  @Get("journal")
  journal(@Req() req: { user: { organizationId: string } }) {
    return this.service.listEntries(req.user.organizationId);
  }

  @Get("trial-balance")
  trialBalance(@Req() req: { user: { organizationId: string } }) {
    return this.service.trialBalance(req.user.organizationId);
  }

  @Post("journal")
  create(
    @Req() req: { user: { organizationId: string } },
    @Body()
    body: {
      description: string;
      lines: { accountId: string; debit: number; credit: number; memo?: string }[];
    },
  ) {
    return this.service.createEntry(req.user.organizationId, body);
  }

  @Post("accounts")
  createAccount(
    @Req() req: { user: { organizationId: string } },
    @Body() body: { code: string; name: string; type: string },
  ) {
    return this.service.createAccount(req.user.organizationId, body);
  }

  @Patch("journal/:id/void")
  voidEntry(
    @Req() req: { user: { organizationId: string } },
    @Param("id") id: string,
  ) {
    return this.service.voidEntry(req.user.organizationId, id);
  }
}
