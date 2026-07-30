import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { canAccessModule, type ModuleId } from "@fsg/shared";

export const MODULE_KEY = "modules";
export const RequireModule = (...modules: ModuleId[]) =>
  SetMetadata(MODULE_KEY, modules);

@Injectable()
export class ModulesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ModuleId[]>(MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) throw new ForbiddenException("Sin sesión");

    const ok = required.some((m) => canAccessModule(user.role, m));
    if (!ok) {
      throw new ForbiddenException(
        `Tu rol no tiene acceso a: ${required.join(", ")}`,
      );
    }
    return true;
  }
}
