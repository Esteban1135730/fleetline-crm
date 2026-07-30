# Fleetline / FSG CRM — Piloto funcional

CRM de transporte web (Next.js) + API NestJS. La app móvil del conductor queda en segundo plano; el foco es el CRM operable por módulo.

## Despliegue en VPS (junto a otro Docker)

Ver **[DEPLOY-VPS.md](./DEPLOY-VPS.md)**: compose `fleetline`, puertos host `3010`/`4010`, red y volúmenes aislados.

```bash
cp .env.production.example .env.production
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Requisitos

- Node 20+, pnpm 9
- Docker (Postgres en puerto **55432**)

## Instalación rápida

```bash
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:migrate
pnpm db:seed
pnpm --filter @fsg/api dev          # :4000
pnpm --filter @fsg/web dev          # :3001
```

## Cuentas demo (seed)

| Usuario | Clave | Uso |
|---------|-------|-----|
| `ceo@fsg.co` | `fsg2026` | Acceso completo |
| `fin@fsg.co` | `fsg2026` | Tesorería / contabilidad |
| `despacho@fsg.co` | `fsg2026` | Operaciones |
| `ops@fsg.co`, `rrhh@fsg.co`, `atencion@fsg.co`, `ti@fsg.co` | `fsg2026` | Roles de área |

## Checklist demo CRM (sin móvil)

1. **Comercial:** cliente → cotización → aprobar → «→ Contrato».
2. **Logística:** viaje con contrato (hereda cliente/valor) → En vía → Cerrar → Facturar.
3. **Finanzas:** ver CxC → Marcar pagada (genera asiento en Contabilidad).
4. **Torre GPS:** actualizar lat/lng desde el formulario web de Logística.
5. **Compras:** flujo hasta Recibida → aparece CxP en Finanzas.
6. **Taller / RRHH / Atención / Archivo / etc.:** CRUD y estados desde cada módulo.

## Variables clave (`.env.example`)

`JWT_SECRET`, `CORS_ORIGINS`, `NEXT_PUBLIC_API_URL`, `DATABASE_URL`.

## App conductor (opcional, segundo plano)

Ver `apps/conductor/README.md`. Login demo: `conductor@fsg.co` / `fsg2026`.

## Fuera de este piloto

DIAN electrónica, WhatsApp Business, listas SARLAFT externas, nómina DIAN, billing SaaS.
