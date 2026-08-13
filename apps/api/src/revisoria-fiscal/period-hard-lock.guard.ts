import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { RevisoriaFiscalService } from "./revisoria-fiscal.service";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rutas contables / fiscales sujetas a Hard Lock de periodo */
const LOCKED_PREFIXES = [
  "/contabilidad",
  "/api/v1/contabilidad",
  "/finanzas",
  "/api/v1/finanzas",
  "/tesoreria",
  "/api/v1/tesoreria",
  "/nomina",
  "/api/v1/nomina",
  "/compras",
  "/api/v1/compras",
];

/** Hard Lock no aplica a estos paths (el propio cierre / dictamen) */
const LOCK_EXEMPT = [
  "/revisoria-fiscal/cierre/hard-lock",
  "/api/v1/revisoria-fiscal/cierre/hard-lock",
  "/revisoria-fiscal/notas",
  "/api/v1/revisoria-fiscal/notas",
  "/revisoria-fiscal/dictamen",
  "/api/v1/revisoria-fiscal/dictamen",
  "/auth",
  "/health",
];

function yearMonthFromBody(body: unknown): Date {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    if (typeof b.yearMonth === "string" && /^\d{4}-\d{2}$/.test(b.yearMonth)) {
      const [y, m] = b.yearMonth.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, 15));
    }
    if (typeof b.postedAt === "string") {
      const d = new Date(b.postedAt);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

/**
 * Bloquea mutaciones en dominios contables cuando el periodo está HARD_LOCKED.
 */
@Injectable()
export class PeriodHardLockGuard implements CanActivate {
  constructor(private revisoria: RevisoriaFiscalService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      path?: string;
      body?: unknown;
      user?: { organizationId?: string };
    }>();

    const method = String(req.method || "GET").toUpperCase();
    if (!MUTATING.has(method)) return true;

    const path = String(req.originalUrl || req.url || req.path || "")
      .split("?")[0]
      .toLowerCase();

    if (LOCK_EXEMPT.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }

    const inScope = LOCKED_PREFIXES.some(
      (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(p),
    );
    if (!inScope) return true;

    const orgId = req.user?.organizationId;
    if (!orgId) return true;

    await this.revisoria.assertPeriodWritable(
      orgId,
      yearMonthFromBody(req.body),
    );
    return true;
  }
}
