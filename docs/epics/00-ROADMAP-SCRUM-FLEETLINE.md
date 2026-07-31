# Fleetline OS — Roadmap Scrum (17 PDFs → 5 Sprints)

**Producto:** Fleetline OS (CRM & Telemetry)  
**Método:** Scrum · Documentación as Code · Agentes Copy / Design / Frontend / Backend  
**Regla de oro:** desarrollo y pruebas **solo en local** — **prohibido `git push` / PR remoto** hasta autorización explícita.

---

## 1. Roles del equipo (agentes)

| Agente | Responsabilidad |
|--------|-----------------|
| **@fleetline-copy** | Microcopy torre/telemetría, errores uplink, estados NOMINAL/ALERT/OFFLINE |
| **@fleetline-design-system** | Tokens Obsidian / Aluminium, tipografía mono en datos |
| **@fleetline-frontend** | Workbench 3 columnas, Inspector, formularios, Data Room UI |
| **@fleetline-backend** | NestJS, Zod, Prisma, guards, hashing, hard/soft rules |
| **Scrum Master (este doc)** | Epics → Stories → Tasks → DoD · orden de sprints |

### Cadencia sugerida
- **Sprint:** 1–2 semanas  
- **Definition of Ready:** Epic MD en `docs/epics/` aprobado (API + schema + DoD)  
- **Definition of Done:** TS compila local + E2E HTTP local + sin `// TODO` + sin push  

---

## 2. Mapa 17 PDFs → Epics

| # | PDF | Epic ID | Sprint |
|---|-----|---------|--------|
| 1 | ARCHIVO Y PAPELERIA | E01 Expediente inmutable | **S1** |
| 2 | SARLAFT | E01 (mismo epic, compliance) | **S1** |
| 3 | REVISOR FISCAL | E01 (ledger lectura + hash) | **S1** (base) / S5 (IA fraude) |
| 4 | COMERCIAL | E02 Revenue command | **S2** |
| 5 | LOGISTICA | E02 Torre de control | **S2** |
| 6 | TRAMITES | E02 Semáforo & sync docs | **S2** |
| 7 | TALLER | E03 Mantenimiento predictivo | **S3** |
| 8 | PARQUEADERO | E03 Patio / bahías | **S3** |
| 9 | TESORERIA | E04 Tesorería & MFA | **S4** |
| 10 | CONTABILIDAD | E04 NIIF / asientos vivos | **S4** |
| 11 | COMPRAS | E04 Procurement & 3-way | **S4** |
| 12 | RRHH | E05 Capital humano | **S5** |
| 13 | RECEPCION I CALL CENTER | E05 Omni-front | **S5** |
| 14 | HQSE | E05 Calidad ISO mesh | **S5** |
| 15 | TEGNOLOGIA Y TI | E05 NOC / STTS | **S5** |
| 16 | GERENCIA GENERAL | E05 Strategy hub | **S5** (dashboard) |
| 17 | PRESIDENCIA | E05 Founder's canvas | **S5** (lectura) |

---

## 3. Cinco sprints concretos

### Sprint 1 — Expediente digital & seguridad *(activo)*
**PDFs:** Archivo, SARLAFT, base Revisoría  
**Doc:** [`01-expediente-inmutable-sarlaft.md`](./01-expediente-inmutable-sarlaft.md)  
**Valor:** bóveda con integridad + no operar con sujetos de alto riesgo  
**Entregables código:**
- Hash SHA-256 en upload `/archivo`
- Soft/hard block SARLAFT en clientes y pagos CxP
- Data Room UI (filtros, metadatos, hash, auditoría)

### Sprint 2 — Torre de control operativa
**PDFs:** Comercial, Logística, Trámites  
**Doc:** [`02-torre-de-control-operativa.md`](./02-torre-de-control-operativa.md)  
**Valor:** cotizar → contrato → viaje; semáforo; inspector  
*(Parcialmente avanzado en hard rules previas: draft trip, semáforo, preop)*

### Sprint 3 — Mantenimiento y patio
**PDFs:** Taller, Parqueadero  
**Doc:** [`03-mantenimiento-y-patio.md`](./03-mantenimiento-y-patio.md)  
**Valor:** odómetro → OT; bahías check-in/out  
*(Odómetro/OT ya en hard rules; bahías pendientes)*

### Sprint 4 — Dinero y abastecimiento
**PDFs:** Tesorería, Contabilidad, Compras  
**Doc:** `04-tesoreria-compras-contabilidad.md` *(crear al abrir sprint)*  
**Valor:** aprobación pagos, 3-way matching simple, causación

### Sprint 5 — Personas, calidad y mando
**PDFs:** RRHH, Recepción/CC, HQSE, TI, Gerencia, Presidencia  
**Doc:** `05-personas-calidad-mando.md` *(crear al abrir sprint)*  
**Valor:** disponibilidad RRHH, tickets, ISO básico, NOC health, KPIs exec

---

## 4. Backlog priorizado (MoSCoW)

| Must (piloto) | Should | Could (visión PDF) |
|---------------|--------|-------------------|
| Hash archivo + audit | Cotizador km/margen | OCR / vector DB |
| SARLAFT block API | Bahías patio | Twilio / voz |
| Semáforo + hard rules despacho | 3-way matching | SECOP / RUNT |
| Preop + OT por km | MFA pago demo | Jarvis / podcast |

---

## 5. Tablero Scrum (plantilla por story)

```
[ ] Ready   docs/epics/*.md completo
[ ] Backend contrato + Prisma + tests HTTP
[ ] Frontend UI + copy
[ ] DoD: tsc/build local OK · E2E local · SIN git push
```

---

## 6. Estado actual del monorepo (baseline)

Ya en código (piloto): módulos CRM, hard rules S1–S2 parciales (despacho, preop, odómetro, approve CxP).  
Sprint 1 de este roadmap **cierra el gap** de integridad documental + enforcement SARLAFT.

---

*Última actualización: 2026-07-30 · Fleetline Scrum Master*
