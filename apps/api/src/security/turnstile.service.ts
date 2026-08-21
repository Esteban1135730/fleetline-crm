import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigLike } from "./turnstile.types";

/**
 * Verificación Cloudflare Turnstile (opcional).
 * Si TURNSTILE_SECRET_KEY no está definido, se omite (dev / VPS sin captcha).
 */
@Injectable()
export class TurnstileService {
  isEnabled(): boolean {
    return Boolean((process.env.TURNSTILE_SECRET_KEY || "").trim());
  }

  async verify(token: string | undefined, ip?: string): Promise<boolean> {
    const secret = (process.env.TURNSTILE_SECRET_KEY || "").trim();
    if (!secret) return true;
    if (!token?.trim()) return false;

    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token.trim());
    if (ip) body.set("remoteip", ip);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  }

  async assertValid(token: string | undefined, ip?: string) {
    if (!(await this.verify(token, ip))) {
      throw new UnauthorizedException("Verificación anti-bot fallida");
    }
  }
}

/** Evita dependencia circular tipada. */
export type { ConfigLike };
