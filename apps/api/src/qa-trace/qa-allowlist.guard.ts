import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { isQaTraceEnabled, isQaViewerEmail } from "./qa-trace.util";

/**
 * Solo el usuario allowlist (esteban*) puede leer el panel QA Trace.
 * El ingest de eventos usa JwtAuthGuard + flag de entorno, sin este guard.
 */
@Injectable()
export class QaAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isQaTraceEnabled()) {
      throw new ForbiddenException("QA Trace desactivado en este entorno");
    }
    const req = context.switchToHttp().getRequest<{
      user?: { email?: string };
    }>();
    if (!isQaViewerEmail(req.user?.email)) {
      throw new ForbiddenException("Acceso restringido — panel QA Trace");
    }
    return true;
  }
}
