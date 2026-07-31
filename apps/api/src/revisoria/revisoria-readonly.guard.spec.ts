import { ForbiddenException } from "@nestjs/common";
import { RevisoriaReadOnlyGuard } from "./revisoria-readonly.guard";

function mockCtx(method: string, role?: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        user: role ? { role } : undefined,
      }),
    }),
  } as never;
}

describe("RevisoriaReadOnlyGuard — Módulo 11", () => {
  const guard = new RevisoriaReadOnlyGuard();

  it("permite GET a rol REVISOR_FISCAL / revisoria", () => {
    expect(guard.canActivate(mockCtx("GET", "revisoria"))).toBe(true);
    expect(guard.canActivate(mockCtx("GET", "REVISOR_FISCAL"))).toBe(true);
    expect(guard.canActivate(mockCtx("HEAD", "revisoria"))).toBe(true);
  });

  it("bloquea POST/PUT/DELETE de revisoría con HTTP 403", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      try {
        guard.canActivate(mockCtx(method, "revisoria"));
        throw new Error(`expected 403 for ${method}`);
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).getStatus()).toBe(403);
        expect((e as ForbiddenException).getResponse()).toMatchObject({
          error: "REVISORIA_READ_ONLY",
        });
      }
    }
  });

  it("no restringe mutaciones de otros roles", () => {
    expect(guard.canActivate(mockCtx("POST", "finanzas"))).toBe(true);
    expect(guard.canActivate(mockCtx("DELETE", "gerencia"))).toBe(true);
  });
});
