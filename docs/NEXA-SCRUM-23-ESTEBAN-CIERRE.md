# SCRUM-23 — Cierre Esteban (gap Manual Único)

Epic: [SCRUM-23](https://inredesoft.atlassian.net/browse/SCRUM-23)  
Fecha: 2026-09-22 · Owner: Esteban Amaya

## Tickets Esteban del epic (implementados)

| Key | Criterio | Código |
|-----|----------|--------|
| **SCRUM-26** | Presupuesto Compras vía API; CxP (`PaymentSchedule`) al RECEIVED | `GET /compras/budget`, `ComprasService.ensurePayableOnReceived`, UI sin hardcode |
| **SCRUM-29** | Liquidación RRHH → Tesorería + Contabilidad | `payroll.calculated` → Contabilidad (ya) + `PaymentQueueService.enqueuePayrollDisbursement` |
| **SCRUM-31** | Preop fallido → bloqueo Logística + OT Taller | `PilotService.applyPreopFailureBlocks` + `LogisticsService.submitPreoperational` |
| **SCRUM-32** | CHECK_OUT patio → timer viaje + turno RRHH | `YardAccessService.startLogisticsTimerAndRrhhShift` |

## Decisiones de producto ya documentadas (tickets previos del epic)

- **SCRUM-30 / COM-03:** WON → viaje `PENDING` (sin auto-despacho).
- Hard-stops mora / SARLAFT / capacidad / PIN gerencia: cerrados en S1–S2.

## Pendiente fuera de Esteban

Issues Samuel (`labels=samuel`, SCRUM-33…40) y resto del epic UI/KPIs — no bloquean este cierre técnico.

## Override cupo Compras

```bash
COMPRAS_MONTHLY_BUDGET_COP=15000000
```
