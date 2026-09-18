# NEXA — Control de tareas (observaciones QA)

**Fuente:** `NEXA a mejorar.pdf`  
**Fecha backlog:** 2026-09-14  
**Total:** 58 tareas  
**Estado:** sin implementar (solo tracking)  
**Equipo:** Esteban Amaya · Samuel Buendia

### Cómo usarlo
1. Esteban trabaja la sección A; Samuel la sección B.
2. Marcar `[x]` al completar.
3. Si se bloquea, poner nota en **Notas / blockers**.
4. Prioridad: **P0 → P1 → P2 → P3**.

### Leyenda de capas
| Capa | Significado |
|------|-------------|
| Front | Solo UI (`apps/web`, labels, guides) |
| Back | Solo API / DB / sync (`apps/api`, Prisma) |
| Front + Back | Ambos |
| Config / Ops | `.env`, keys, deploy |
| Producto | Decisión de alcance + copy/RBAC |

---

## Resumen

| Persona | Cantidad | P0 | P1 | P2/P3 |
|---------|----------|----|----|-------|
| Esteban Amaya | 29 | 9 | 16 | 4 | ← **29/29 hechas** |
| Samuel Buendia | 30 | 0 | 10 | 20 | ← 0/30 hechas |

---

## A) Tareas de Esteban Amaya

> Bugs críticos, sync entre módulos, validaciones, integraciones, seguridad.

### P0 — hacer primero

- [x] **REC-06** · Recepción · RFID único (anti-duplicados)  
  - **Capa:** Front + Back  
  - **Hacer:** Validar unicidad de RFID en create/update; error claro al front.  
  - **Tocar:** `apps/api` (constraint/unique + validación) + form visitantes  

- [x] **PRE-01** · Presidencia · Persistir Protocolo de crisis al cambiar área  
  - **Capa:** Front  
  - **Hacer:** Conservar modo crisis al navegar entre áreas (estado global/contexto/store).  
  - **Tocar:** `apps/web` shell/navegación + estado crisis  

- [x] **TES-01** · Tesorería · PIN al aprobar / ejecutar pagos  
  - **Capa:** Front + Back  
  - **Hacer:** Exigir PIN (o MFA) en aprobación y pago sensibles.  
  - **Tocar:** `apps/api` tesorería approve/pay + `apps/web` modal PIN  

- [x] **TES-05** · Tesorería · Fix sync pendiente Tesorería ↔ Gerencia (~$1M)  
  - **Capa:** Back  
  - **Hacer:** Investigar por qué Gerencia sigue mostrando pendiente tras pagos; alinear agregación/estado.  
  - **Tocar:** `apps/api` agregados Gerencia + estados pago Tesorería  

- [x] **LOG-01** · Logística · Configurar API Key GPS / mapas  
  - **Capa:** Config / Ops  
  - **Hacer:** Resolver env/secret de API Key; documentar setup; UI de error si falta.  
  - **Tocar:** `.env` + cliente mapas + pantallas Servicios/GPS  

- [x] **LOG-02** · Logística · Sync estado conductor Logística ↔ RRHH  
  - **Capa:** Back  
  - **Hacer:** Al cambiar estado en Logística, propagar a RRHH.  
  - **Tocar:** `apps/api` logística conductores + RRHH personal  

- [x] **LOG-03** · Logística · Validar unidad no bloqueada / no asignada  
  - **Capa:** Front + Back  
  - **Hacer:** Hard-stop al asignar vehículo bloqueado o ya en otro servicio.  
  - **Tocar:** `apps/api` asignación unidades + feedback UI  

- [x] **COM-03** · Comercial · Contrato no debe crear viaje automático  
  - **Capa:** Back  
  - **Hacer:** Quitar o condicionar side-effect que crea viaje en Logística al marcar Contrato.  
  - **Tocar:** `apps/api` comercial → logística (creación viaje)  

- [x] **TRA-02** · Trámites · Bug sync vencimientos tras renovación  
  - **Capa:** Back  
  - **Hacer:** Tras renovar, re-sync no debe revertir a vencido.  
  - **Tocar:** `apps/api` lógica sync RUNT / vencimientos  

### P1

- [x] **REC-02** · Recepción · Bandeja / listado de PQRS con estado  
  - **Capa:** Front + Back  
  - **Hacer:** Listar PQRS, filtrar por estado y ver detalle; endpoint list/detail si no existe.  
  - **Tocar:** `apps/web` recepción PQRS + `apps/api` módulo recepción/PQRS  

- [x] **REC-04** · Recepción · Acciones en tablero de visitantes  
  - **Capa:** Front + Back  
  - **Hacer:** Cambiar estado, finalizar visita y editar info desde el tablero.  
  - **Tocar:** `apps/web` tablero visitantes + API update visitante/estado  

- [x] **REC-08** · Recepción · Reparar Radar de rutas  
  - **Capa:** Front + Back  
  - **Hacer:** Diagnosticar por qué no lee/actualiza; corregir feed o consumo API.  
  - **Tocar:** `apps/web` radar rutas + API/servicio asociado  

- [x] **PRE-03** · Presidencia · Auditoría forense: reporte real (no placeholder)  
  - **Capa:** Front + Back  
  - **Hacer:** Definir campos del reporte y generar archivo con datos reales.  
  - **Tocar:** `apps/api` endpoint descarga + `apps/web` trigger download  

- [x] **GER-01** · Gerencia · Filtros temporales (día/semana/mes/año)  
  - **Capa:** Front + Back  
  - **Hacer:** Filtro de periodo; API que acepte rango y agregue métricas.  
  - **Tocar:** `apps/web` Gerencia + `apps/api` agregaciones  

- [x] **GER-02** · Gerencia · Clarificar / integrar PIN en bandeja de aprobaciones  
  - **Capa:** Front + Back  
  - **Hacer:** Documentar o cablear el PIN al flujo concreto de autorización.  
  - **Tocar:** `apps/web` bandeja aprobaciones + API verificación PIN  

- [x] **RRHH-04** · RRHH · Liquidación por días trabajados / periodos  
  - **Capa:** Front + Back  
  - **Hacer:** Liquidación proporcional (días, quincena, periodo), no solo bruto mensual.  
  - **Tocar:** `apps/api` nómina/liquidación + `apps/web` vista liquidación  

- [x] **CON-03** · Contabilidad · Reglas de reopen tras cierre de mes  
  - **Capa:** Front + Back  
  - **Hacer:** Definir si se puede reabrir, hasta cuándo y quién; UI + guard API.  
  - **Tocar:** `apps/api` cierre contable + `apps/web` cierre de mes  

- [x] **CON-04** · Contabilidad · Asientos en borrador (cuadrar al confirmar)  
  - **Capa:** Front + Back  
  - **Hacer:** Guardar DRAFT descuadrado; validar cuadre solo al confirmar.  
  - **Tocar:** `apps/api` estados asiento + `apps/web` form asientos  

- [x] **TES-04** · Tesorería · Comprobante obligatorio en pagos/compras  
  - **Capa:** Front + Back  
  - **Hacer:** Validar adjunto obligatorio en operaciones configuradas.  
  - **Tocar:** `apps/api` validación + `apps/web` form pago/compra  

- [x] **COM-02** · Comercial · Origen/actualización del valor de peajes  
  - **Capa:** Front + Back  
  - **Hacer:** Definir fuente de peajes y auto-relleno; evitar valor manual obsoleto.  
  - **Tocar:** `apps/api` peajes/rutas + `apps/web` campo peajes  

- [x] **COM-04** · Comercial · Evitar contratos duplicados por ruta  
  - **Capa:** Front + Back  
  - **Hacer:** Regla de unicidad o warning fuerte al crear contrato repetido.  
  - **Tocar:** `apps/api` contratos + UI warning  

- [x] **QHSE-03** · QHSE · Filtro incidentes abiertos vs históricos  
  - **Capa:** Front + Back  
  - **Hacer:** Default solo abiertos + toggle histórico; no acumular cerrados en KPI activo.  
  - **Tocar:** `apps/web` incidentes + query API por estado  

- [x] **TEC-02** · Tecnología · Simplificar UI / RBAC por perfil  
  - **Capa:** Front + Back  
  - **Hacer:** Limitar vistas técnicas a roles TI; vista reducida para admin general.  
  - **Tocar:** `apps/web` módulo TI + guards RBAC API  

- [x] **TAL-01** · Taller · Estados intermedios de solicitudes  
  - **Capa:** Front + Back  
  - **Hacer:** Workflow: Recibida → Diagnóstico → En curso → Esperando repuestos → Pendiente aprobación → Finalizada.  
  - **Tocar:** Prisma/API estados OT + `apps/web` Taller  

- [x] **TAL-02** · Taller · Alertas predictivas por vehículo  
  - **Capa:** Front + Back  
  - **Hacer:** Alertas predictivas funcionando y asociadas a unidad específica.  
  - **Tocar:** `apps/api` telemetría/taller + `apps/web` alertas  

### P2 / Producto

- [x] **LOG-04** · Logística · Definir alcance Nóminas extra vs RRHH  
  - **Capa:** Producto  
  - **Hacer:** Decidir integrar con RRHH o documentar diferencia; ajustar UI/copy.  
  - **Tocar:** Producto + `apps/web` Logística nóminas extra (+ API si se unifica)  

- [x] **TRA-01** · Trámites · Evaluar / diseñar integración RUNT  
  - **Capa:** Back  
  - **Hacer:** Spike: factibilidad, contratos API, costo; propuesta de sync automática.  
  - **Tocar:** `apps/api` trámites + doc técnica  

- [x] **TRA-03** · Trámites · Actualización automática desde RUNT (si hay integración)  
  - **Capa:** Front + Back  
  - **Hacer:** Job/webhook que refresque SOAT/TO/pólizas desde fuente oficial.  
  - **Tocar:** `apps/api` jobs sync + UI última sync  

- [x] **TEC-04** · Tecnología · Definir persona objetivo del módulo TI  
  - **Capa:** Producto  
  - **Hacer:** Documento corto de roles permitidos y acciones; reflejar en permisos.  
  - **Tocar:** Producto + rbac (shared/api) + copy módulo  

---

## B) Tareas de Samuel Buendia

> Copy, UX, tooltips, traducciones, formularios, tablas, paginación, pulido visual.  
> Pueden avanzar en paralelo sin bloquear los P0 de backend.

### P1

- [ ] **REC-09** · Recepción · Errores de registro en el formulario  
  - **Capa:** Front  
  - **Hacer:** Mostrar errores junto al campo/modal; no en el dashboard.  
  - **Tocar:** `apps/web` registro usuarios/visitantes  

- [ ] **PRE-02** · Presidencia · Fix input costo unitario (concatena 0)  
  - **Capa:** Front  
  - **Hacer:** El valor inicial 0 debe reemplazarse al tipear, no concatenarse (`025`).  
  - **Tocar:** `apps/web` simulación de inversión (input numérico)  

- [ ] **RRHH-01** · RRHH · Errores de registro de personal en el formulario  
  - **Capa:** Front  
  - **Hacer:** Errores locales al modal/formulario, no en dashboard.  
  - **Tocar:** `apps/web/app/rrhh` (form alta personal)  

- [ ] **REV-01** · Revisoría · Ver soporte / adjunto de revisión  
  - **Capa:** Front + Back  
  - **Hacer:** UI para abrir/descargar archivo asociado; URL firmada si aplica.  
  - **Tocar:** `apps/web` Revisoría + `apps/api` archivos adjuntos  

- [ ] **CON-01** · Contabilidad · Asientos en formato tabla  
  - **Capa:** Front  
  - **Hacer:** Reemplazar listado continuo por tabla densa (debe/haber, cuenta, ref).  
  - **Tocar:** `apps/web` Contabilidad asientos  

- [ ] **TES-02** · Tesorería · Confirmación de cobros recibidos  
  - **Capa:** Front + Back  
  - **Hacer:** Paso de verificación (quién recibió / checkbox + evidencia) al confirmar cobro.  
  - **Tocar:** `apps/web` cobros + API confirmación cobro  

- [ ] **TES-03** · Tesorería · Visualizar comprobante tras pago/compra  
  - **Capa:** Front + Back  
  - **Hacer:** Preview del archivo cargado en el detalle de la operación.  
  - **Tocar:** `apps/web` detalle pago/compra + storage URL API  

- [ ] **COM-01** · Comercial · Destino: mapa / dropdown / autocomplete  
  - **Capa:** Front + Back  
  - **Hacer:** Selector asistido de destino para reducir typos.  
  - **Tocar:** `apps/web` cotización/destino + API lugares si aplica  

- [ ] **QHSE-04** · QHSE · Refresh de reportes tras cambios  
  - **Capa:** Front + Back  
  - **Hacer:** Invalidar/refetch reportes cuando cambian datos fuente.  
  - **Tocar:** `apps/web` reportes QHSE (+ cache API si aplica)  

- [ ] **TEC-03** · Tecnología · CRUD tickets: crear, cerrar, área responsable  
  - **Capa:** Front + Back  
  - **Hacer:** Acciones create/close y campo área responsable visible.  
  - **Tocar:** `apps/api` tickets TI + `apps/web` Tecnología  

### P2

- [ ] **REC-01** · Recepción · Tooltips / descripciones en KPIs  
  - **Capa:** Front  
  - **Hacer:** Tooltip o leyenda corta por KPI (qué mide y de dónde sale).  
  - **Tocar:** `apps/web` pantalla Recepción / Call Center (KPIs)  

- [ ] **REC-03** · Recepción · Clarificar término Prospecto  
  - **Capa:** Front  
  - **Hacer:** Renombrar o agregar ayuda contextual con definición operativa.  
  - **Tocar:** `apps/web` recepción + `labels-es` / `module-guides`  

- [ ] **REC-05** · Recepción · Explicar campo Anfitrión  
  - **Capa:** Front  
  - **Hacer:** Label + tooltip de qué es el anfitrión y por qué es obligatorio.  
  - **Tocar:** `apps/web` formulario registro visitantes  

- [ ] **REC-07** · Recepción · Clarificar bandeja omnicanal  
  - **Capa:** Front  
  - **Hacer:** Copy, empty state y señales de acciones (responder, asignar, cerrar).  
  - **Tocar:** `apps/web` bandeja omnicanal + `module-guides`  

- [ ] **UM-01** · Usuario maestro · Traducir términos en inglés  
  - **Capa:** Front  
  - **Hacer:** Auditoría de copy residual EN → ES (labels, botones, estados).  
  - **Tocar:** `apps/web` + `packages/shared` labels-es  

- [ ] **PRE-04** · Presidencia · Zonas de crisis: lista / presets  
  - **Capa:** Front + Back  
  - **Hacer:** Multi-select de zonas predefinidas en lugar de texto libre.  
  - **Tocar:** `apps/web` protocolo crisis; catálogo zonas en API/DB si hace falta  

- [ ] **RRHH-02** · RRHH · Clarificar módulo Fatiga  
  - **Capa:** Front  
  - **Hacer:** Nombre más descriptivo + ayuda (qué mide, cuándo bloquea).  
  - **Tocar:** `apps/web` RRHH Fatiga + guides / labels  

- [ ] **RRHH-03** · RRHH · Confirmación / descripción en Ejecutar auditoría  
  - **Capa:** Front  
  - **Hacer:** Modal de confirmación con resumen del proceso e impacto.  
  - **Tocar:** `apps/web` RRHH botón auditoría  

- [ ] **RRHH-05** · RRHH · Confirmación antes de liquidar  
  - **Capa:** Front  
  - **Hacer:** Diálogo de confirmación previa a la liquidación definitiva.  
  - **Tocar:** `apps/web` RRHH nómina  

- [ ] **CON-02** · Contabilidad · Filtro por PUC  
  - **Capa:** Front + Back  
  - **Hacer:** Filtro/búsqueda por código o cuenta PUC.  
  - **Tocar:** `apps/web` filtros + query API asientos  

- [ ] **COM-05** · Comercial · Mejorar UI edición de contratos  
  - **Capa:** Front  
  - **Hacer:** Botón/form edición más visible y usable.  
  - **Tocar:** `apps/web` tabla contratos  

- [ ] **COM-06** · Comercial · Paginación contratos operativos  
  - **Capa:** Front + Back  
  - **Hacer:** Paginación (page size) en tabla de contratos operativos.  
  - **Tocar:** `apps/web` + API list contratos (skip/take)  

- [ ] **CMP-02** · Compras · Estados de recepción en ES + semáforo  
  - **Capa:** Front  
  - **Hacer:** Textos 100% español y badges de color (Recibida, En camino, etc.).  
  - **Tocar:** `apps/web` Compras recepción  

- [ ] **QHSE-01** · QHSE · Nombre/explicación del módulo QHSE  
  - **Capa:** Front  
  - **Hacer:** Título en español o subtítulo + guía en SlideOverHelp.  
  - **Tocar:** `apps/web` nav + `module-guides`  

- [ ] **SAR-01** · SARLAFT · Descripción de finalidad e impacto en el OS  
  - **Capa:** Front  
  - **Hacer:** Copy: qué hace SARLAFT y cómo afecta/bloquea otros módulos.  
  - **Tocar:** `apps/web` SARLAFT + `module-guides`  

- [ ] **TEC-01** · Tecnología · Explicar QR de MDM Provisioning  
  - **Capa:** Front  
  - **Hacer:** Texto claro: para qué es el QR y qué ocurre al escanearlo.  
  - **Tocar:** `apps/web` MDM Provisioning  

- [ ] **ARC-01** · Archivo · Clarificar finalidad del módulo Archivo  
  - **Capa:** Front  
  - **Hacer:** Copy + guía: data room, consulta, IA, etc.  
  - **Tocar:** `apps/web` Archivo + `module-guides`  

- [ ] **ARC-02** · Archivo · Explicar qué puede hacer el usuario con archivos  
  - **Capa:** Front  
  - **Hacer:** Empty state + acciones (subir, buscar, versionar, compartir).  
  - **Tocar:** `apps/web` Archivo  

### P3

- [ ] **CMP-01** · Compras · Renombrar Homologar proveedor  
  - **Capa:** Front  
  - **Hacer:** Cambiar copy a “Agregar proveedor” (o equivalente claro).  
  - **Tocar:** `apps/web` Compras + labels-es  

- [ ] **QHSE-02** · QHSE · Indicar puntaje máximo de satisfacción  
  - **Capa:** Front  
  - **Hacer:** Mostrar escala explícita (ej. 0–5 / 0–100).  
  - **Tocar:** `apps/web` QHSE satisfacción  

---

## Notas / blockers

| Fecha | ID | Persona (Esteban / Samuel) | Nota |
|-------|-----|----------------------------|------|
|  |  |  |  |

---

## Historial de avance (opcional)

| Semana | Esteban Amaya (hechas) | Samuel Buendia (hechas) | Comentario |
|--------|------------------------|-------------------------|------------|
|  |  |  |  |

---

## Fuera de alcance (no es tarea)

- Usuario maestro → Registro de empresa: **ya funciona correctamente** (no crear ticket).
- En el PDF aparece “SAELAFT”; en el sistema se trata como **SARLAFT** (`SAR-01`).
