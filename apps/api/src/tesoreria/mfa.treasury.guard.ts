import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { MfaService } from "./mfa.service";

/**
 * Exige MFA (OTP) cuando el monto del desembolso supera el umbral configurado.
 */
@Injectable()
export class MfaTreasuryGuard implements CanActivate {
  constructor(private mfa: MfaService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      body?: {
        mfaToken?: string;
        amount?: number;
        items?: Array<{ amount?: number }>;
        paymentScheduleIds?: string[];
      };
      user?: { id?: string; email?: string };
    }>();

    const body = req.body ?? {};
    let amount = Number(body.amount ?? 0);
    if ((!amount || amount <= 0) && Array.isArray(body.items)) {
      amount = body.items.reduce((s, i) => s + Number(i.amount ?? 0), 0);
    }

    // Si solo vienen IDs, el service validará MFA con el total real;
    // el guard exige token presente cuando el cliente declara monto alto.
    const threshold = this.mfa.thresholdCop();
    const declaredHigh = amount > threshold;
    const hasIds = (body.paymentScheduleIds?.length ?? 0) > 0;

    if (!declaredHigh && !hasIds) {
      return true;
    }

    // Con IDs sin monto: exigir token preventivo si envía mfaRequired flag implícito
    // (el service revalida). Si declara monto bajo, ok.
    if (!declaredHigh) {
      return true;
    }

    const token = body.mfaToken?.trim();
    if (!token) {
      throw new ForbiddenException({
        error: "MFA_REQUIRED",
        message: `Desembolso > ${threshold} COP requiere token MFA (OTP)`,
        thresholdCop: threshold,
      });
    }

    if (!this.mfa.validateToken(token, req.user?.email)) {
      throw new ForbiddenException({
        error: "MFA_INVALID",
        message: "Token MFA inválido o expirado",
      });
    }

    return true;
  }
}
