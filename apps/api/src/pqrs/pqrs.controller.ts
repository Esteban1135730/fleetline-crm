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
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { PqrsTicketService } from "./pqrs-ticket.service";
import { VisitorControlService } from "./visitor-control.service";
import {
  CreatePqrsTicketSchema,
  ListPqrsTicketsQuerySchema,
  ResolvePqrsTicketSchema,
  VisitorCheckInSchema,
  VisitorCheckOutSchema,
} from "./dto/pqrs.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("pqrs")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("call_center", "pqrs", "atencion", "recepcion")
export class PqrsController {
  constructor(
    private tickets: PqrsTicketService,
    private visitors: VisitorControlService,
  ) {}

  @Get("tickets")
  listTickets(
    @Req() req: AuthReq,
    @Query() query: Record<string, string>,
  ) {
    const parsed = ListPqrsTicketsQuerySchema.parse(query ?? {});
    return this.tickets.list(req.user.organizationId, parsed);
  }

  @Post("tickets")
  createTicket(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CreatePqrsTicketSchema.parse(body ?? {});
    return this.tickets.create(req.user.organizationId, dto);
  }

  @Post("tickets/:id/resolve")
  resolveTicket(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const dto = ResolvePqrsTicketSchema.parse(body ?? {});
    return this.tickets.resolve(req.user.organizationId, id, dto);
  }

  @Get("visitas")
  listVisitas(@Req() req: AuthReq) {
    return this.visitors.list(req.user.organizationId);
  }

  @Post("visitas/check-in")
  checkIn(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = VisitorCheckInSchema.parse(body ?? {});
    return this.visitors.checkIn(req.user.organizationId, dto);
  }

  @Post("visitas/check-out")
  checkOut(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = VisitorCheckOutSchema.parse(body ?? {});
    return this.visitors.checkOut(req.user.organizationId, dto);
  }
}
