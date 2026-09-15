# TRA-01 — Spike: integración RUNT

**Fecha:** 2026-09-14  
**Owner:** Esteban Amaya  
**Estado:** diseño / listo para contrato (sin API gov productiva)

## Objetivo

Consultar la fuente oficial (RUNT / proveedor homologado) para actualizar SOAT, tecnomecánica y tarjeta de operación, y alimentar el Kill-Switch de despacho.

## Qué hay hoy en NEXA

| Pieza | Ubicación | Comportamiento |
|-------|-----------|----------------|
| Cliente | `apps/api/src/tramites/runt.client.ts` | Mock determinista; HTTP si `RUNT_API_URL` + `RUNT_API_TOKEN` |
| Sync | `apps/api/src/tramites/runt-sync.service.ts` | Upsert `ComplianceDocument` + Kill-Switch |
| Manual | `POST /tramites/sync/:vehicleId` | On-demand por placa |
| Nightly | `nightly-compliance.worker.ts` | Recalcula vencimientos locales; RUNT opcional vía `RUNT_NIGHTLY_SYNC` |
| UI | `apps/web/src/app/tramites/page.tsx` | Botón Sync RUNT |

### Contrato adapter esperado

```
GET {RUNT_API_URL}/vehicles/:plate
GET {RUNT_API_URL}/licenses/:document
Authorization: Bearer {RUNT_API_TOKEN}
```

Respuesta mapeada a `RuntVehicleReport` / `RuntLicenseReport` (tipos en `runt.client.ts`).

## Factibilidad

1. **MinTransporte / RUNT directo:** requiere convenio institucional, IP allowlist y SLA; no hay API pública abierta.
2. **Proveedor homologado (RUNT web services / broker):** path más realista para CRM; costo por consulta o cupo mensual.
3. **Mientras tanto:** mock + sync manual + nightly local (TRA-03 gated).

## Riesgos (TRA-02 ya mitigado)

- No pisar renovación local vigente con dato gov/mock más antiguo.
- Rate-limit: batch nightly con `take` + delay.
- Auditoría: `notes` / `runtPayload` en cada doc.

## Decisión pendiente

- [ ] Elegir proveedor / convenio
- [ ] Definir cupo y costo COP/consulta
- [ ] Activar `RUNT_NIGHTLY_SYNC=true` solo en staging con mock o sandbox
- [ ] Exponer “última sync” en UI flota

## Variables de entorno

Ver `.env.example`:

- `RUNT_API_URL`
- `RUNT_API_TOKEN`
- `RUNT_MOCK_EXPIRED_PLATES`
- `RUNT_NIGHTLY_SYNC` (default `false`)
- `RUNT_NIGHTLY_BATCH` (default `50`)
