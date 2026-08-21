import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { runWithTenant } from "./tenant-context";

type Authed = Request & {
  user?: { organizationId?: string; userId?: string };
};

/** Propaga organizationId del JWT al AsyncLocalStorage (RLS / auditoría). */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Authed, _res: Response, next: NextFunction) {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    if (!organizationId && !userId) {
      next();
      return;
    }
    runWithTenant({ organizationId, userId }, () => next());
  }
}
