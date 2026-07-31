import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { PassengerAppService } from "./passenger-app.service";
import {
  GenerateBoardingPassSchema,
  ValidateBoardingPassSchema,
} from "./dto/pasajeros.dto";

type AuthReq = { user: { organizationId: string; userId: string } };

@Controller("pasajeros")
@UseGuards(JwtAuthGuard, ModulesGuard)
@RequireModule("apps", "pasajeros")
export class PasajerosController {
  constructor(private service: PassengerAppService) {}

  @Post("boarding-pass/generate")
  generate(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = GenerateBoardingPassSchema.parse(body ?? {});
    return this.service.generateBoardingPass(req.user.organizationId, dto);
  }

  @Post("boarding/validate")
  validate(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = ValidateBoardingPassSchema.parse(body ?? {});
    return this.service.validateBoarding(
      req.user.organizationId,
      dto,
      req.user.userId,
    );
  }

  @Get("trip-tracking/:tripId")
  tracking(@Req() req: AuthReq, @Param("tripId") tripId: string) {
    return this.service.tripTracking(req.user.organizationId, tripId);
  }
}
