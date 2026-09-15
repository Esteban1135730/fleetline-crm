# TEC-04 — Persona objetivo del módulo Tecnología / TI

**Fecha:** 2026-09-14  
**Owner:** Esteban Amaya  

## Persona

**Líder de tecnología e infraestructura (Líder TI / SysAdmin)**  
Roles de código: `lider_ti`, `tecnologia`, `sistemas` (+ `org_admin` / `platform_master` para IAM).

## Qué puede hacer

| Área | Acciones |
|------|----------|
| NOC | Salud API/DB, logs, latencia |
| IAM | Usuarios, onboarding, MDM QR |
| Helpdesk | Crear / ver tickets TI |
| Integraciones | DLQ Kafka, STTS (si aplica) |
| Archivo | Solo si se mantiene en `ROLE_MODULES` (custodia tech) |

## Qué NO es este módulo

- Finanzas / Tesorería / Contabilidad  
- RRHH / nómina  
- Despacho / Logística operativa  
- Presidencia / Gerencia (lectura ejecutiva) — **retirada de `ROLE_MODULES`**

## Implementación

- `packages/shared/src/index.ts` → `ROLE_MODULES.lider_ti` / `tecnologia` sin `presidencia` ni `gerencia`
- `apps/api/src/ti/ti.controller.ts` → roles técnicos (sin gerente general en mutaciones NOC)
- Guía `?` → `module-guides.ts` → `tecnologia_ti`
- Header UI → `apps/web/src/app/ti/dashboard/page.tsx`
