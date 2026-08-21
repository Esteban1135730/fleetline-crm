# Seguridad — Fleetline / Inretrans OS

Hardening aplicado (19 pilares). Resumen operativo.

## Variables de entorno obligatorias

| Variable | Uso |
|----------|-----|
| `JWT_SECRET` | Firma JWT (≥32 chars en prod; **nunca** el valor de `.env.example`) |
| `DATABASE_URL` | Postgres; en prod preferir `?sslmode=require` si el servidor lo exige |
| `FIELD_ENCRYPTION_KEY` | AES-256-GCM de campos sensibles (si falta, se usa JWT_SECRET) |
| `CORS_ORIGINS` | Allowlist exacta de orígenes web |
| `TREASURY_MFA_STATIC_OTP` | OTP 6 dígitos **obligatorio en prod** (no `000000`) |
| `TURNSTILE_SECRET_KEY` | Opcional; si está, login/register exigen token Turnstile |
| `TURNSTILE_SITE_KEY` | Front (NEXT_PUBLIC_TURNSTILE_SITE_KEY) |
| `COOKIE_SECURE` / `FORCE_HTTPS` | Cookies Secure + redirect detrás de proxy |
| `PRISMA_SLOW_QUERY_MS` | Umbral slow query (default 500) |

## Qué hace el código

1. **Secretos** — sin fallback JWT hardcodeado; boot falla si falta.
2. **`.gitignore`** — `.env*`, reports Playwright, `*.pem` / `*.key`.
3. **RLS** — migración `20260821140000_rls_tenant_isolation` (ENABLE + policies). Para FORCE + rol app no-owner, ver ops.
4. **Cifrado** — `encryptField` / `decryptField` (AES-256-GCM) en `apps/api/src/security/field-crypto.ts`.
5. **Auth global** — `JwtAuthGuard` + `@Public()` en login/register/health/logout.
6. **Cookies** — `fl_access` HttpOnly; Secure+SameSite=Strict en prod.
7. **Hashes** — bcrypt cost **12**.
8. **Rate limit** — Throttler global + login/register 5 / 15 min.
9. **Turnstile** — activo solo si hay `TURNSTILE_SECRET_KEY`.
10. **Uploads** — MIME/ext allowlist, 5 MB, UUID; en prod `/uploads` solo autenticado.
11. **Helmet** — CSP/HSTS/XFO/nosniff en prod.
12. **Audit** — `pnpm audit:deps`.

## Historial Git / secretos rastreados

Si algún `.env` o clave real llegó a commits antiguos, **rotar** JWT/DB passwords y valorar `git filter-repo` / BFG. Este repo ignora `.env.production`; no se purga historial automáticamente.

## Deploy

Tras `git pull`:

```bash
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Asegura `JWT_SECRET` fuerte y `TREASURY_MFA_STATIC_OTP` en `.env.production`. Migraciones incluyen RLS.
