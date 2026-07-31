import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";

/**
 * Marca la request como modo directiva (Founder's Canvas / Strategy Hub).
 * La enforcement vive en DirectiveReadOnlyGuard; este interceptor expone contexto.
 */
@Injectable()
export class DirectiveReadOnlyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      user?: { role?: string; directiveReadOnly?: boolean };
      directiveMode?: boolean;
    }>();

    const role = String(req.user?.role || "").toLowerCase();
    req.directiveMode = Boolean(
      req.user?.directiveReadOnly || role === "presidencia",
    );

    return next.handle();
  }
}
