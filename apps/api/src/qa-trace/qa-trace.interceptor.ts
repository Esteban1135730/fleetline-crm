import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { QaTraceService } from "./qa-trace.service";
import { clientIp, isQaTraceEnabled } from "./qa-trace.util";

/**
 * Registra mutaciones API (POST/PATCH/PUT/DELETE) como acciones QA
 * cuando el flag está activo. No bloquea la respuesta.
 */
@Injectable()
export class QaTraceInterceptor implements NestInterceptor {
  constructor(private qa: QaTraceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!isQaTraceEnabled()) return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: {
        userId?: string;
        email?: string;
        name?: string;
        organizationId?: string;
      };
      headers?: Record<string, string | string[] | undefined>;
      ip?: string;
    }>();

    const method = String(req.method || "GET").toUpperCase();
    if (method === "GET" || method === "OPTIONS" || method === "HEAD") {
      return next.handle();
    }

    const path = String(req.originalUrl || req.url || "").slice(0, 500);
    const sessionHeader = req.headers?.["x-qa-session"];
    const sessionId = Array.isArray(sessionHeader)
      ? sessionHeader[0]
      : sessionHeader;

    return next.handle().pipe(
      tap({
        next: () => {
          if (!req.user?.userId) return;
          void this.qa.safeIngestFromApi(
            {
              userId: req.user.userId,
              email: req.user.email,
              name: req.user.name,
              organizationId: req.user.organizationId,
            },
            path,
            method,
            clientIp(req),
            String(req.headers?.["user-agent"] || "").slice(0, 400) || null,
            sessionId,
          );
        },
      }),
    );
  }
}
