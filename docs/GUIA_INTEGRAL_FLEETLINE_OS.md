# Guía Integral — Fleetline OS

**Producto:** Fleetline OS (CRM & Telemetry)  
**Organización piloto:** FSG Transportes  
**Versión documental:** 1.0 · Julio 2026  
**Audiencia:** operaciones, comercial, finanzas, despacho, conductores, gerencia y TI  

> Este manual describe **funcionalidades implementadas en el monorepo** (`crmtrasporte`).  
> Lo marcado como *roadmap* o *piloto limitado* no debe asumirse en producción cloud avanzada (OCR, Kafka, listas OFAC automáticas, etc.).

---

## Tabla de contenidos

1. [Visión general y arquitectura](#1-visión-general-y-arquitectura)
2. [Núcleo de seguridad y hard rules](#2-núcleo-de-seguridad-y-hard-rules)
3. [Operaciones y logística](#3-módulo-de-operaciones-y-logística)
4. [Comercial y clientes](#4-módulo-comercial-y-clientes)
5. [Mantenimiento y parqueadero](#5-módulo-de-mantenimiento-y-parqueaderos)
6. [Finanzas, compras y gobierno](#6-finanzas-compras-y-gobierno)
7. [Guía por roles](#7-guía-paso-a-paso-de-uso-por-roles)
8. [Anexo técnico](#8-anexo-técnico-accesos-endpoints-y-datos)

---

## 1. Visión general y arquitectura

### 1.1 Concepto

Fleetline OS es el sistema operativo de flota de FSG: una torre de control que une **despacho, documentación vehicular, comercial, taller, patio, tesorería y cumplimiento (SARLAFT / archivo)** en un único monorepo.

Principios de producto:

- Vocabulario operativo (NOMINAL / ALERT / OFFLINE), no jerga SaaS genérica.
- Datos de telemetría y placas en tipografía **mono** (JetBrains Mono / Space Mono).
- Diseño Aero-Tech: Obsidian Telemetry (dark) y Aluminium & Quartz (light), acento esmeralda.

### 1.2 Stack

| Capa | Tecnología |
|------|------------|
| Web CRM | Next.js 15 (`@fsg/web`) — puerto **3000** |
| API | NestJS 11 (`@fsg/api`) — puerto **4000** |
| App conductor | Expo / React Native (`@fsg/conductor`) |
| Datos | PostgreSQL + Prisma 6 (`@fsg/db`) — Docker **55432** |
| Contratos compartidos | Zod / tipos (`@fsg/shared`) |
| UI kit | `@fsg/ui` (Button, Badge, Tooltip, KPIs) |

### 1.3 Shell de 3 columnas

1. **Sidebar (departamentos)** — navegación colapsable por áreas (no 20 módulos sueltos).
2. **Workbench** — contenido del módulo activo.
3. **Inspector / Help** — panel derecho contextual (detalle de viaje/cotización o guía `[?]`).

**TopBar:** marca Fleetline, badge de módulo, buscador global, estado de uplink, tema claro/oscuro, usuario.

### 1.4 Estándar de usabilidad (Zero Clutter & Hyper-Explained)

| Capacidad | Comportamiento |
|-----------|----------------|
| Multi-acordeón | Varios departamentos abiertos a la vez; solo se cierran con clic explícito |
| Persistencia | `localStorage` (`flt-nav-depts-open`, sidebar colapsado) |
| Tooltips | Botones, filtros, badges de semáforo y totales con explicación operativa |
| Centro de ayuda `[?]` | Guía de **3 pasos** del módulo actual |
| Atajos | **Cmd/Ctrl+K** búsqueda global · **Cmd/Ctrl+/** ayuda · **Esc** cierra paneles |
| Clean Cockpit | Dashboard con 3 KPIs + 4 acciones rápidas (sin saturar gráficos) |

Departamentos del menú:

1. Operaciones y flota  
2. Comercial y clientes  
3. Mantenimiento y taller  
4. Finanzas y gobierno  
5. Personas y mando  

---

## 2. Núcleo de seguridad y hard rules

Constantes en `@fsg/shared` (`HARD_RULES`):

| Regla | Valor | Efecto |
|-------|-------|--------|
| Documentos por vencer | **15 días** | Semáforo amarillo / `EXPIRING` |
| Fatiga máxima | **80** | Bloquea despacho |
| Intervalo OT preventiva | **10.000 km** | Genera Work Order al cruzar umbral |
| Distancia default al cerrar viaje | **45 km** | Si no se envía `distanceKm` |

### 2.1 Matriz Trámites ↔ Logística

Documentos críticos evaluados:

- SOAT  
- Tecnomecánica  
- Tarjeta de operación  

**Bloqueo de despacho** (`ComplianceService.assertCanAssign`) cuando:

- Algún documento crítico está **vencido** (rojo).
- Vehículo en `OUT_OF_SERVICE` o `MAINTENANCE`.
- Conductor inactivo.
- Empleado RRHH (mismo documento) en estado INACTIVE / MEDICAL / VACATION.
- `fatigueScore ≥ 80`.

Endpoints de lectura:

- `GET /logistics/dispatch-board` — readiness de flota y conductores.  
- `GET /tramites/fleet-matrix` — semáforo agregado + por placa.

### 2.2 Semáforo visual de flota

| Color | Condición | Significado operativo |
|-------|-----------|------------------------|
| **Verde** | vigencia **> 15 días** | Apto para despacho |
| **Amarillo** | vigencia **≤ 15 días** | Planificar renovación |
| **Rojo** | **vencido** | Bloqueo activo — no despachar |

En UI Trámites: conteos + tabla filtrable (Todos / Aptos / Alertas) con tooltips del tipo:  
*"Bloqueo activo: este vehículo no puede ser despachado porque tiene la Póliza SOAT vencida"*.

### 2.3 Disponibilidad y fatiga (RRHH)

- Módulo `/rrhh`: personal por área, estado laboral, fatiga.
- El matching operativo usa `Employee.document` ↔ `Driver.document`.
- El despachador ve bloqueos en el board de logística antes de asignar.

---

## 3. Módulo de operaciones y logística

### 3.1 Torre de control

Ruta web: `/logistica`.

Capacidades:

- Alta de viajes (origen, destino, fecha, cliente/contrato, unidad, conductor, tarifa).
- Estados: `PENDING` → `ASSIGNED` → `IN_TRANSIT` → `COMPLETED` / `CANCELLED` / `INCIDENT`.
- Filtros workbench: **Todos / En ruta / Alertas**.
- Búsqueda por placa, conductor, código o ruta.
- GPS en vivo vía **WebSocket** (`/logistics`) + coordenadas en mono.
- Cierre de viaje → puede facturar CxC; novedades registran incidente real.

### 3.2 Checklist preoperacional (App Conductor)

Pantalla: `PreoperationalScreen` (Expo).

Ítems obligatorios (APTO / NO APTO):

1. Frenos  
2. Luces  
3. Llantas  
4. Kit de carretera  
5. Nivel de aceite  
(+ observaciones opcionales)

Flujo:

1. Conductor abre viaje asignado → **Inspección preop.**  
2. Marca todos en APTO → **FIRMAR Y ENVIAR PREOPERACIONAL**.  
3. Habilita **INICIAR RUTA** (`IN_TRANSIT`).  
4. Solo entonces se transmite GPS (~**12 s**).

Hard rule API:

> Si se intenta `IN_TRANSIT` sin `preoperationalAt`:  
> **400** — *"Imposible iniciar viaje: Se requiere inspección preoperacional aprobada."*

Contrato Zod (`PreoperationalChecklistSchema`): campos en español (`frenos`, `luces`, `llantas`, `kitCarretera`, `nivelAceite`, `observaciones`).

### 3.3 Ficha en Inspector Panel (web)

Desde la tabla de viajes: clic en fila o botón **Preop.** abre el inspector con:

- Hora exacta del sellado (mono).  
- Badges APTO por ítem.  
- Observaciones del conductor.  
- Tooltip de estado: *"Preoperacional validado por el conductor a las [Hora]"*.

API:

- `POST /logistics/trips/:id/preoperational`  
- `GET /logistics/my-trips` (app móvil)  
- `PATCH /logistics/trips/:id/status`  
- `PATCH /logistics/gps/:vehicleId`

---

## 4. Módulo comercial y clientes

Ruta web: `/comercial`.

### 4.1 Clientes B2B

- Alta con nombre, NIT, segmento (`B2B` / `ESCOLAR` / `TURISMO`).
- El NIT se valida contra el último chequeo **SARLAFT**; riesgos `HIGH`/`BLOCKED` bloquean el alta (override solo presidencia/finanzas con auditoría).

### 4.2 Cotizador inteligente

Panel en pantalla con cálculo en tiempo real.

Entradas:

- Origen / destino  
- Tipo de unidad: Bus escolar, Bus turismo, Camión, Van  
- Distancia km  
- Cantidad de peajes  
- Margen deseado (default **30%**)

Fórmula:

\[
\text{Costo operativo} = (\text{km} \times \text{costoKm}) + (\text{peajes} \times 18\,000) + \text{pagoConductor}
\]

\[
\text{Precio sugerido} = \frac{\text{Costo operativo}}{1 - (\text{margen}/100)}
\]

Métricas mostradas (JetBrains Mono):

- Costo estimado de ruta  
- Peajes aproximados  
- Utilidad bruta estimada  
- **Precio final sugerido al cliente**

Tooltip típico:  
*"Calculado automáticamente con un margen objetivo del 30% sobre costos de ruta y peajes"*.

API: `POST /comercial/quotes/calculate` · guardar cotización con `calcJson`.

### 4.3 De cotización a viaje

| Acción | Resultado |
|--------|-----------|
| Guardar cotización | Estado `DRAFT`, monto = precio sugerido |
| Enviar | `SENT` |
| **APROBAR Y CONVERTIR A VIAJE** / status `WON` o `APPROVED` | Viaje borrador **`TRP-XXXX`** en Logística (`PENDING`) con cliente, ruta y tarifa |
| → Contrato | Contrato `CTR-…` + viaje borrador (flujo existente `to-contract`) |

Estados de cotización: `DRAFT`, `SENT`, `APPROVED`, `WON`, `REJECTED`, `EXPIRED`.

### 4.4 Contratos

- Canal privado o licitación pública.  
- Ruta, vigencia, valor mensual.  
- Vinculables a viajes en operaciones.

---

## 5. Módulo de mantenimiento y parqueaderos

### 5.1 Taller y odómetro

- Flota: alta de vehículos, estado (`AVAILABLE`, `IN_SERVICE`, `MAINTENANCE`, …).  
- Órdenes de trabajo: `OPEN` → `IN_PROGRESS` → `WAITING_PARTS` → `DONE`.  
- Campos: `odometerKm`, `maintenanceEveryKm` (default 10.000).

Al **cerrar un viaje** (`COMPLETED`):

1. Se acumula distancia al odómetro (o 45 km por defecto).  
2. Si se **cruza** un múltiplo del umbral → se crea OT automática tipo  
   *"Preventivo odómetro — umbral 10000 km alcanzado…"*.  
3. El vehículo puede pasar a `MAINTENANCE`.

### 5.2 Parqueadero / patio

Ruta: `/parqueadero`.

Implementado en piloto:

- Check-in / check-out con placa, conductor y guarda.  
- Resumen del día y listado de movimientos.  
- Modelo `ParkingLog` en Prisma.

*Roadmap (Epic E03):* asignación explícita de **bahía** (`bayCode`) — aún no en schema productivo.

---

## 6. Finanzas, compras y gobierno

### 6.1 Tesorería

Ruta: `/finanzas`.

- CxC / CxP con estados `DRAFT`, `ISSUED`, `PAID`, `OVERDUE`, `CANCELLED`.  
- **Aprobación de pago** obligatoria en CxP antes de marcar pagada  
  (`PATCH /finance/invoices/:id/approve-payment`).  
- Al pagar: asientos contables (bancos / CxC / CxP) cuando el PUC está sembrado.  
- SARLAFT puede bloquear el desembolso a proveedor de alto riesgo.

### 6.2 Contabilidad y revisoría

- PUC, asientos de partida doble, balance de prueba.  
- Hallazgos de revisoría fiscal con seguimiento.

### 6.3 Compras

Flujo de estados simplificado (piloto):

`REQUESTED` → `APPROVED` → `ORDERED` → `RECEIVED` / `CANCELLED`

Encadena solicitud → aprobación → recepción. La **puerta de desembolso** se cierra en Tesorería con aprobación CxP (equivalente operativo a un matching simplificado solicitud/recepción/pago; no es un 3-way matching ERP completo con OC/GR/factura DIAN).

### 6.4 Archivo digital (bóveda)

Ruta: `/archivo` — Data Room.

- Upload real a disco (`uploads/`) con **hash SHA-256** (`contentHash`).  
- Filtros por categoría y búsqueda por título / tags / hash.  
- Log de auditoría inmutable (`ARCHIVE_VAULT`, `ARCHIVE_INDEX`, `ARCHIVE_DELETE`).  
- Hash visible en tipografía mono.

### 6.5 SARLAFT

- Registro manual de chequeos (`LOW` / `MEDIUM` / `HIGH` / `BLOCKED`).  
- Bloqueo blando/duro en **creación de cliente** y **pago CxP**.  
- Override `forceDespiteSarlaft` solo roles privilegiados + `AuditLog`.

### 6.6 Otros módulos de gobierno

| Módulo | Función |
|--------|---------|
| Jurídico | FUEC vinculados a vehículo/contrato |
| Calidad / HSQE | NPS e incidentes |
| Recepción | Visitantes check-in/out |
| Call center | Tickets manuales |
| Sistemas | Health API/DB + alertas |
| Usuarios | Cuentas y roles |
| Apps | Indicadores por canal CRM |

---

## 7. Guía paso a paso de uso por roles

### 7.1 Despachador (`despacho@fsg.co`)

1. Inicie sesión → el menú abre **Operaciones y flota** por defecto.  
2. En **Trámites**, revise el semáforo: priorice rojos/amarillos.  
3. En **Logística**, cree el viaje y asigne solo unidades/conductores aptos (board de despacho).  
4. Espere que el conductor firme el **preoperacional** en la app.  
5. Cuando el viaje esté en ruta, monitoree GPS y novedades.  
6. Al cerrar, confirme odómetro/OT si aplica.

Atajos: Cmd/Ctrl+K para saltar a Logística o Trámites; `[?]` para la guía de 3 pasos.

### 7.2 Conductor (`conductor@fsg.co` + app Expo)

1. Login en la app Fleetline Conductor.  
2. Seleccione un viaje `ASSIGNED` / `PENDING`.  
3. Complete la inspección (5 ítems APTO) → **FIRMAR Y ENVIAR**.  
4. Pulse **INICIAR RUTA** — se habilita GPS.  
5. Al terminar, cierre el viaje o reporte novedad.

Sin preoperacional no hay ruta ni telemetría.

### 7.3 Ejecutivo comercial

1. Alta de cliente (NIT limpio en SARLAFT).  
2. Abra el **Cotizador inteligente**: ruta, tipo de unidad, km, peajes, margen.  
3. Revise precio sugerido y utilidad → **Guardar cotización**.  
4. Abra el inspector de la cotización → **APROBAR Y CONVERTIR A VIAJE**.  
5. Verifique en Logística el borrador `TRP-XXXX`.  
6. Opcional: genere contrato operativo (`→ Contrato`).

### 7.4 Administrador / Presidencia (`ceo@fsg.co`)

1. Dashboard Clean Cockpit: viajes activos, alertas, facturación MTD.  
2. Supervisión de SARLAFT y Archivo (integridad SHA-256).  
3. Tesorería: apruebe CxP antes de desembolsar.  
4. Usuarios y roles; Sistemas/NOC para salud del nodo.  
5. Acceso a todos los departamentos del sidebar.

### 7.5 Finanzas (`fin@fsg.co`)

1. Emita / revise CxC y CxP.  
2. En CxP: **Aprobar pago** → luego marcar pagada.  
3. Contabilidad: ver asientos y balance.  
4. Archivo / SARLAFT / Revisoría según permisos del rol.

### 7.6 RRHH / Atención / Sistemas

- **RRHH:** mantener estados y fatiga al día (impacta despacho).  
- **Atención:** tickets de call center.  
- **Sistemas:** health, alertas, usuarios.

---

## 8. Anexo técnico: accesos, endpoints y datos

### 8.1 Credenciales seed (password `fsg2026`)

| Email | Rol |
|-------|-----|
| `ceo@fsg.co` | Presidencia (todo) |
| `ops@fsg.co` | Gerencia |
| `fin@fsg.co` | Finanzas |
| `despacho@fsg.co` | Despacho |
| `conductor@fsg.co` | App conductor |
| `rrhh@fsg.co` | RRHH |
| `atencion@fsg.co` | Call center |
| `ti@fsg.co` | Sistemas |

### 8.2 Puertos locales

- Web `http://localhost:3000`  
- API `http://localhost:4000` (`GET /health`)  
- Postgres `localhost:55432`

### 8.3 Endpoints clave (API)

| Prefijo | Capacidad |
|---------|-----------|
| `/auth` | Login, me, password, users |
| `/dashboard` | metrics, charts |
| `/comercial` | customers, quotes (+ calculate, status, to-contract), contracts |
| `/logistics` | trips, preoperational, gps, dispatch-board, my-trips, drivers |
| `/tramites` | fleet-matrix, procedures |
| `/fleet` | vehicles, work-orders |
| `/finance` | invoices, approve-payment, pay |
| `/parqueadero` | checkin, checkout, logs, summary |
| `/archivo` | upload, documents, audit |
| `/sarlaft` | checks |
| `/compras` | orders + status |
| `/accounting` | accounts, journal, trial-balance |
| `/rrhh` `/atencion` `/calidad` `/juridico` `/recepcion` `/sistemas` `/revisoria` | módulos de gobierno |

### 8.4 Campos Prisma relevantes (piloto reciente)

- `Trip`: `distanceKm`, `preoperationalAt`, `preoperationalJson`, `fareAmount`  
- `Vehicle`: `odometerKm`, `maintenanceEveryKm`  
- `Invoice`: `paymentApprovedAt`, `paymentApprovedById`  
- `ArchiveDocument`: `contentHash`, `byteSize`, `uploadedById`  
- `Quote`: `calcJson`, estado `WON`  
- `AuditLog`: bóveda y overrides SARLAFT  

### 8.5 Fuera de alcance del piloto (visión PDF)

OCR / NLP / pgvector, scraping OFAC automático, Kafka, LPR de patio, nómina DIAN electrónica, WhatsApp Business API, bahías IoT.

### 8.6 Roadmap Scrum (docs internos)

Ver `docs/epics/00-ROADMAP-SCRUM-FLEETLINE.md` y epics 01–03.

---

## Control de cambios

| Fecha | Cambio |
|-------|--------|
| 2026-07-30 | Primera edición integral alineada al código: hard rules, preop, cotizador, UX Zero Clutter, archivo/SARLAFT |

---

*Fleetline OS — documentación oficial del monorepo `crmtrasporte`. Compatible con exportación a PDF (Markdown → Pandoc / VS Code / Notion).*
