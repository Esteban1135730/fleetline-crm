import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { SchoolRouteService } from "./school-route.service";
import { ParentsTrackingService } from "./parents-tracking.service";
import {
  BoardingCheckInSchema,
  RouteEndSchema,
  RouteStartSchema,
  SchoolNoveltySchema,
} from "./dto/escolar.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("escolar")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("apps", "escolar", "monitora", "padres")
export class EscolarController {
  constructor(
    private routes: SchoolRouteService,
    private parents: ParentsTrackingService,
  ) {}

  @Get("routes")
  listRoutes(@Req() req: AuthReq) {
    return this.routes.listRoutes(req.user.organizationId);
  }

  @Post("routes/start")
  startRoute(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = RouteStartSchema.parse(body ?? {});
    return this.routes.startRoute(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post("routes/end")
  endRoute(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = RouteEndSchema.parse(body ?? {});
    return this.routes.endRoute(req.user.organizationId, dto);
  }

  @Post("boarding/check-in")
  boardingCheckIn(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = BoardingCheckInSchema.parse(body ?? {});
    return this.routes.boardingCheckIn(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Post("novelties")
  novelties(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = SchoolNoveltySchema.parse(body ?? {});
    return this.routes.registerNovelty(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("padres/student-status/:studentId")
  studentStatus(
    @Req() req: AuthReq,
    @Param("studentId") studentId: string,
  ) {
    return this.parents.studentStatus(req.user.organizationId, studentId);
  }

  @Get("padres/bus-location/:routeId")
  busLocation(@Req() req: AuthReq, @Param("routeId") routeId: string) {
    return this.parents.busLocation(req.user.organizationId, routeId);
  }
}
