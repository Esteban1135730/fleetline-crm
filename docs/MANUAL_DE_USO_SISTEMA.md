# Manual de Uso — Fleetline / INRETRANS OS

**Sistema:** CRM & Telemetry de transporte (Aero-Tech, multi-tenant)  
**Empresa demo:** Empresa de Transporte Demo S.A.S.  
**Clave demo (todos los usuarios de prueba):** `Inretrans2026*`  
**Audiencia:** operación, gerencia y soporte de implementación  
**Versión documento:** 1.0

---

## A. Introducción y Arquitectura Multi-Tenant

INRETRANS OS separa **plataforma** (dueño del software) de **tenant** (empresa de transporte). Cada organización opera su flota, usuarios y datos de forma aislada; el Usuario Maestro no sustituye la autonomía operativa del tenant.

### A.1 Capas

| Capa | Quién | Alcance |
|------|--------|---------|
| **Plataforma** | `SUPERADMIN` (`superadmin@inretrans.com`) | Alta/baja de empresas, Org Admin inicial, directorio global de cuentas, salud del SaaS |
| **Tenant (Org)** | Org Admin + roles de área | Usuarios propios, contraseñas, módulos operativos, datos de flota/comercial/finanzas |
| **Dominio operativo** | Roles por área (Recepcionista → Conductor) | RBAC estricto: lectura/escritura solo en su perímetro |

### A.2 Usuario Maestro (Propietario Plataforma)

1. Autenticarse en `/login` con `superadmin@inretrans.com`.
2. Ir a `/plataforma`.
3. Registrar empresa (NIT único, razón social, Org Admin).
4. El Org Admin del tenant gestiona usuarios/contraseñas **sin intervención** del Maestro, salvo auditoría o soporte.

**Denegado al Maestro en modo operativo tenant:** mutar viajes, pagos, OT de taller o telemetría “como si fuera” un rol de flota (salvo herramientas de plataforma explícitas).

### A.3 Autonomía del Tenant

- Cada empresa crea, desactiva y resetea contraseñas de su personal.
- Los datos de un tenant no son visibles para otro.
- Roles directivos (Presidencia, Revisoría Fiscal, Control Interno) son **read-only** sobre bases operativas mutativas cuando la política del módulo lo exige.

### A.4 Acceso rápido demo

1. Abrir la app web → `/login`.
2. Usar un email de la matriz (sección B) + `Inretrans2026*`.
3. El sistema redirige al **home path** del rol.
4. Ayuda contextual: botón `[ ? ]` o `Cmd/Ctrl + /`. Cerrar con `Esc`.

---

## B. Matriz de Credenciales de Prueba

**Contraseña universal demo:** `Inretrans2026*`  
**Organización tenant demo:** Empresa de Transporte Demo S.A.S.  
**Organización plataforma:** INRETRANS Plataforma (solo Usuario Maestro)  
**PIN ejecutivo Gerencia General:** `258014`

| # | Email | Rol | Título genérico | Home path | Contraseña |
|---|-------|-----|-----------------|-----------|------------|
| 1 | superadmin@inretrans.com | SUPERADMIN | Usuario Maestro / Propietario Plataforma | `/plataforma` | Inretrans2026* |
| 2 | recepcion@inretrans.com | RECEPCIONISTA | Recepción & Concierge | `/recepcion/dashboard` | Inretrans2026* |
| 3 | ti@inretrans.com | LIDER_TI | Tecnología / NOC | `/ti/dashboard` | Inretrans2026* |
| 4 | archivo@inretrans.com | GESTOR_DOCUMENTAL | Archivo & Papelería | `/archivo/dashboard` | Inretrans2026* |
| 5 | auxiliarcontable@inretrans.com | AUXILIAR_CONTABLE | Auxiliar Contable | `/contabilidad/auxiliar/dashboard` | Inretrans2026* |
| 6 | contabilidad@inretrans.com | GESTOR_CONTABLE | Contabilidad / Facturación DIAN | `/contabilidad/gestor/dashboard` | Inretrans2026* |
| 7 | tesoreria@inretrans.com | TESORERIA | Tesorería / Dispersión | `/tesoreria` | Inretrans2026* |
| 8 | cfo@inretrans.com | DIRECTOR_FINANCIERO | Dirección Financiera (CFO) | `/finanzas/cfo/dashboard` | Inretrans2026* |
| 9 | qhse@inretrans.com | LIDER_QHSE | QHSE / PESV | `/qhse/dashboard` | Inretrans2026* |
| 10 | compras@inretrans.com | LIDER_COMPRAS | Compras / Smart Procurement | `/compras/dashboard` | Inretrans2026* |
| 11 | direccionoperativa@inretrans.com | DIRECTOR_OPERATIVO | Dirección Operativa | `/operaciones/director/dashboard` | Inretrans2026* |
| 12 | despacho@inretrans.com | GESTOR_OPERATIVO | Micro-Despacho | `/operaciones/despacho/dashboard` | Inretrans2026* |
| 13 | coordinacioncampo@inretrans.com | COORDINADOR_CAMPO | Coordinación de Campo | `/operaciones/campo/dashboard` | Inretrans2026* |
| 14 | centrocontrol@inretrans.com | OPERADOR_CENTRO_CONTROL | Centro de Control / Watchtower | `/centro-control/dashboard` | Inretrans2026* |
| 15 | controlinterno@inretrans.com | AUDITOR_CONTROL_INTERNO | Control Interno Forense | `/control-interno/dashboard` | Inretrans2026* |
| 16 | presidencia@inretrans.com | PRESIDENTE | Presidencia / Founder's Canvas | `/presidencia/dashboard` | Inretrans2026* |
| 17 | vinculaciones@inretrans.com | GESTOR_VINCULACIONES | Vinculaciones / Smart Onboarding | `/vinculaciones/dashboard` | Inretrans2026* |
| 18 | direccioncomercial@inretrans.com | DIRECTOR_COMERCIAL | Dirección Comercial B2B | `/comercial/director/dashboard` | Inretrans2026* |
| 19 | ventas@inretrans.com | GESTOR_COMERCIAL | Ejecución Comercial | `/comercial/gestor/dashboard` | Inretrans2026* |
| 20 | coordinacioncomercial@inretrans.com | COORDINADOR_COMERCIAL | Coordinación Comercial | `/comercial/coordinador/dashboard` | Inretrans2026* |
| 21 | gerenciageneral@inretrans.com | GERENTE_GENERAL | Gerencia General (PIN 258014) | `/gerencia/dashboard` | Inretrans2026* |
| 22 | juridico@inretrans.com | DIRECTOR_JURIDICO | Jurídico / Legal Hub | `/juridico/dashboard` | Inretrans2026* |
| 23 | revisoriafiscal@inretrans.com | REVISOR_FISCAL | Revisoría Fiscal | `/revisoria-fiscal/dashboard` | Inretrans2026* |
| 24 | coordinadortaller@inretrans.com | COORDINADOR_TALLER | Coordinador Taller 4.0 | `/taller/coordinador/dashboard` | Inretrans2026* |
| 25 | almacentaller@inretrans.com | AUXILIAR_ALMACEN_TALLER | Almacén Taller | `/taller/almacen/dashboard` | Inretrans2026* |
| 26 | mecanico@inretrans.com | MECANICO | Mecánico / Evidencia visual | `/taller/mecanico` | Inretrans2026* |
| 27 | coordinadorpatio@inretrans.com | COORDINADOR_PATIO | Coordinador Patio / Smart Yard | `/patio/dashboard` | Inretrans2026* |
| 28 | auxiliarpatio@inretrans.com | AUXILIAR_PATIO | Auxiliar Patio / Yard App | `/patio/yard-app` | Inretrans2026* |
| 29 | conductor@inretrans.com | CONDUCTOR | Conductor / FSG Pilot | `/pilot` | Inretrans2026* |
| 30 | subgerencia@inretrans.com | SUB_GERENTE | Subgerencia / Ejecución táctica | `/subgerencia/dashboard` | Inretrans2026* |

> **Nota:** En entornos seed alternativos pueden existir aliases nominales (`elena@`, `carolina@`, etc.) con los mismos roles. La matriz anterior es la referencia canónica de este manual.

---

## C. Manual Operativo Módulo por Módulo

Hard-stops transversales (aparecen en varios módulos):

| Código / condición | Efecto |
|--------------------|--------|
| SOAT / docs críticos vencidos | `complianceBlocked` — unidad no despachable |
| Fatiga PESV | Bloqueo de asignación de conductor |
| Viáticos pendientes | Hard-stop en cierre / liquidación según flujo |
| Alcoholimetría fallida / ausente | Impide salida operativa |
| LPR sin viaje activo | Acceso a patio denegado o en cuarentena |
| OTP / PIN Gerencia (`258014`) | Acciones ejecutivas sensibles |
| Periodo contable `HARD_LOCKED` | Sin asientos ni mutaciones del periodo |
| Velocidad Pilot > 15 km/h | Lock de UI de conducción (seguridad) |
| QC taller incompleto | Unidad no liberada a Logística |

---

### 1. Recepción & Concierge — `RECEPCIONISTA`

**Home:** `/recepcion/dashboard` · **Demo:** `recepcion@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** registrar visitas, llamadas, tickets de atención, bitácora de ingreso a sede; consultar estado de citas y contactos.
- **Puede ver:** directorio operativo básico, estado de recepción Omni.
- **Denegado:** despacho de flota, pagos, mutación contable, override de compliance, altas de usuario Org Admin.

#### Procesos y Flujos Paso a Paso

1. Login → dashboard de Recepción.
2. Registrar llegada (visitante / proveedor / autoridad) con documento y motivo.
3. Abrir o actualizar ticket de llamada (Omni-Reception).
4. Escalar a área dueña (Comercial, Jurídico, Operaciones) desde el ticket.
5. Cerrar atención con resultado y marca de tiempo.
6. Al inicio de turno, verificar cola abierta y prioridades.

#### Alertas y Bloqueos (Hard-Stops)

- Sujeto en lista restrictiva / SARLAFT alto riesgo: no avanzar a alta comercial ni pago (escalar).
- Sin área destino válida: ticket no se cierra como “resuelto”.

---

### 2. Tecnología / TI — `LIDER_TI`

**Home:** `/ti/dashboard` · **Demo:** `ti@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** monitorear NOC (API, DB, Kafka, uptime), abrir/cerrar incidentes TI, documentar post-mortem técnico.
- **Puede ver:** señales de salud de servicios, alertas STTS.
- **Denegado:** mutar datos de negocio (viajes, facturas, nómina); impersonar roles de flota.

#### Procesos y Flujos Paso a Paso

1. Revisar ping API / latencia DB al inicio de jornada.
2. Filtrar alertas abiertas por severidad.
3. Asignar incidente y registrar causa raíz.
4. Coordinar con Operaciones si hay pérdida de telemetría (Signal lost).
5. Cerrar incidente con evidencia de restauración Nominal.
6. Exportar bitácora para auditoría cuando Control Interno lo solicite.

#### Alertas y Bloqueos (Hard-Stops)

- Kafka / uplink Offline: notificar Centro de Control y Despacho.
- Credenciales de integración expiradas: rotación obligatoria antes de reactivar jobs.

---

### 3. Archivo & Papelería — `GESTOR_DOCUMENTAL`

**Home:** `/archivo/dashboard` · **Demo:** `archivo@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** clasificar, versionar y recuperar documentos (Data Room); control de papelería / stock de insumos de archivo.
- **Puede ver:** metadatos de expedientes autorizados.
- **Denegado:** alterar asientos contables; liberar compliance de flota sin Trámites/QHSE.

#### Procesos y Flujos Paso a Paso

1. Recibir documento (digital u OCR) y tipificar (póliza, contrato, FUEC, etc.).
2. Indexar en carpeta de expediente / unidad / tercero.
3. Aplicar retención y marca de confidencialidad.
4. Atender solicitud de copia a Jurídico o Revisoría (solo lectura donde aplique).
5. Registrar salida de papelería / insumos.
6. Auditar documentos próximos a vencer y notificar área dueña.

#### Alertas y Bloqueos (Hard-Stops)

- Documento crítico vencido enlazado a unidad → refuerza `complianceBlocked` en despacho.
- Expediente en litigio: solo lectura / cadena de custodia.

---

### 4. Auxiliar Contable — `AUXILIAR_CONTABLE`

**Home:** `/contabilidad/auxiliar/dashboard` · **Demo:** `auxiliarcontable@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** capturar borradores de asientos, conciliar soportes, preparar papeles de trabajo.
- **Puede ver:** PUC, movimientos del periodo abierto.
- **Denegado:** cierre de periodo; anular facturas DIAN; override `HARD_LOCKED`.

#### Procesos y Flujos Paso a Paso

1. Revisar bandeja de soportes pendientes (CxC/CxP, nómina, taller).
2. Armar borrador de asiento (débito = crédito).
3. Adjuntar evidencia y enviar a Gestor Contable.
4. Corregir observaciones del revisor.
5. Confirmar imputación en cuentas PUC correctas.
6. Reportar diferencias de conciliación bancaria a Tesorería.

#### Alertas y Bloqueos (Hard-Stops)

- Periodo `HARD_LOCKED`: escritura bloqueada.
- Asiento descuadrado: no avanza a aprobación.

---

### 5. Contabilidad / Facturación DIAN — `GESTOR_CONTABLE`

**Home:** `/contabilidad/gestor/dashboard` · **Demo:** `contabilidad@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** aprobar asientos, emitir/gestionar facturación electrónica, balance de prueba, cierre operativo del periodo (si no está hard-locked por Revisoría).
- **Puede ver:** libros, DIAN status, conciliaciones.
- **Denegado:** dispersión de fondos (Tesorería); mutar telemetría o despacho.

#### Procesos y Flujos Paso a Paso

1. Validar cola de borradores del Auxiliar.
2. Aprobar o rechazar asiento con motivo.
3. Emitir factura / nota según flujo DIAN.
4. Revisar balance de prueba.
5. Coordinar con CFO cortes de rentabilidad.
6. Preparar cierre; si Revisoría aplica hard-lock, solo lectura.

#### Alertas y Bloqueos (Hard-Stops)

- `HARD_LOCKED`: sin mutaciones del periodo.
- Factura sin NIT/validación SARLAFT: no emisión.
- Periodo abierto con diferencias materiales: no cerrar.

---

### 6. Tesorería — `TESORERIA`

**Home:** `/tesoreria` · **Demo:** `tesoreria@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** gestionar CxC/CxP, aprobar dispersiones con MFA/controles, registrar pagos y cobros.
- **Puede ver:** flujo de caja, vencimientos, estado de proveedores/clientes.
- **Denegado:** reabrir periodo hard-locked; alterar OT de taller; override SARLAFT sin auditoría privilegiada.

#### Procesos y Flujos Paso a Paso

1. Revisar vencidos CxC y CxP del día.
2. Priorizar pagos críticos (nómina extras, proveedores 3-way OK).
3. Ejecutar dispersión con autenticación reforzada cuando aplique.
4. Marcar factura pagada / cobrada con soporte.
5. Conciliar movimientos con Auxiliar/Gestor Contable.
6. Escalar bloqueos SARLAFT a Compliance / Jurídico.

#### Alertas y Bloqueos (Hard-Stops)

- Proveedor HIGH/BLOCKED SARLAFT: pago denegado.
- 3-Way Matching incompleto (OC ≠ recepción ≠ factura): no pagar.
- Viáticos pendientes sin liquidar: hard-stop en flujos de cierre de viaje asociados.

---

### 7. Dirección Financiera (CFO) — `DIRECTOR_FINANCIERO`

**Home:** `/finanzas/cfo/dashboard` · **Demo:** `cfo@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** ver rentabilidad por ruta/cliente/unidad, KPIs de margen, escenarios financieros de alto nivel.
- **Puede ver:** consolidado Tesorería + Contabilidad + Comercial ganado.
- **Denegado:** operar caja día a día; editar despachos; romper hard-lock revisoría.

#### Procesos y Flujos Paso a Paso

1. Abrir canvas de rentabilidad (margen, costos flota, CxC).
2. Filtrar por periodo / línea de negocio.
3. Identificar rutas o clientes bajo umbral.
4. Coordinar con Comercial (precio) y Operaciones (costo).
5. Validar con Tesorería liquidez vs compromiso.
6. Reportar a Gerencia / Presidencia hallazgos materiales.

#### Alertas y Bloqueos (Hard-Stops)

- Datos de periodo locked: solo lectura histórica.
- Inconsistencia ingreso vs despacho cerrado: señal de alerta forense (escalar Control Interno).

---

### 8. QHSE / PESV — `LIDER_QHSE`

**Home:** `/qhse/dashboard` · **Demo:** `qhse@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** gestionar PESV, fatiga, incidentes, telemetría de seguridad, carbon/compliance continuo.
- **Puede ver:** scores de riesgo conductor/unidad, alertas IoT asociadas a seguridad.
- **Denegado:** autorizar pago; alterar facturación; liberar unidad con docs vencidos sin remediación documental.

#### Procesos y Flujos Paso a Paso

1. Revisar semáforo PESV / fatiga al turno.
2. Registrar o cerrar incidente con severidad y evidencia.
3. Validar alcoholimetría previa a salida crítica.
4. Coordinar con Despacho unidades/conductores bloqueados.
5. Seguir CAPA hasta cierre.
6. Reportar a Gerencia incumplimientos reiterados.

#### Alertas y Bloqueos (Hard-Stops)

- Fatiga PESV: conductor no asignable.
- Alcoholimetría fallida/ausente: salida bloqueada.
- Docs de seguridad vencidos: refuerza `complianceBlocked`.

---

### 9. Compras — `LIDER_COMPRAS`

**Home:** `/compras/dashboard` · **Demo:** `compras@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** solicitudes, OC, proveedores, Smart Procurement, seguimiento 3-Way Matching.
- **Puede ver:** stock solicitado por Taller/Almacén, precios, lead times.
- **Denegado:** pagar (Tesorería); mutar OT mecánica; hard-lock contable.

#### Procesos y Flujos Paso a Paso

1. Crear solicitud con ítem, cantidad y justificación.
2. Convertir a OC y enviar a proveedor.
3. Registrar recepción parcial/total.
4. Emparejar factura vs OC vs recepción (3-Way).
5. Liberar a Tesorería solo si matching OK.
6. Auditar desviaciones de precio/cantidad.

#### Alertas y Bloqueos (Hard-Stops)

- 3-Way incompleto: bloqueo de pago.
- Proveedor SARLAFT bloqueado: no emitir OC efectiva.
- Recepción sin evidencia: no cierra matching.

---

### 10. Dirección Operativa — `DIRECTOR_OPERATIVO`

**Home:** `/operaciones/director/dashboard` · **Demo:** `direccionoperativa@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** visionar Gantt de flota, prioridades de capacidad, stop de flota / decisiones de alto nivel operativo.
- **Puede ver:** estado agregado Despacho + Campo + Centro Control + Taller.
- **Denegado:** forzar unidad con `complianceBlocked` sin remediación; mutar contabilidad.

#### Procesos y Flujos Paso a Paso

1. Revisar Gantt / ocupación de flota.
2. Identificar cuellos (taller, docs, fatiga).
3. Priorizar servicios críticos del día.
4. Autorizar reasignaciones estratégicas a Despacho.
5. Coordinar con Patio ingresos/salidas masivas.
6. Escalar a Gerencia si hay stop de flota material.

#### Alertas y Bloqueos (Hard-Stops)

- SOAT/FUEC/licencias vencidas: flota no programable.
- Stop de flota por QHSE/Compliance: no override silencioso.
- OT sin QC: unidad no vuelve a logística.

---

### 11. Micro-Despacho — `GESTOR_OPERATIVO`

**Home:** `/operaciones/despacho/dashboard` · **Demo:** `despacho@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** asignar unidad/conductor, programar servicios, aplicar hard-stops de despacho, seguimiento de estado del viaje.
- **Puede ver:** disponibilidad real, semáforo documental, fatiga.
- **Denegado:** editar asientos; bypass alcoholimetría; liberar LPR sin viaje.

#### Procesos y Flujos Paso a Paso

1. Abrir cola de servicios pendientes.
2. Seleccionar unidad apta (docs verdes).
3. Seleccionar conductor apto (PESV / fatiga / alcoholimetría).
4. Confirmar ruta, horarios y puntos.
5. Despachar → estado En proceso (GPS / auditoría).
6. Cerrar o reasignar ante falla; liquidar extras según reglas.

#### Alertas y Bloqueos (Hard-Stops)

- `complianceBlocked` (SOAT/docs): no despacho.
- Fatiga PESV / alcoholimetría: hard-stop.
- Viáticos pendientes en reglas de cierre: impide cierre limpio.
- Unidad en taller sin QC: no disponible.

---

### 12. Coordinación de Campo — `COORDINADOR_CAMPO`

**Home:** `/operaciones/campo/dashboard` · **Demo:** `coordenacioncampo@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** sincronizar novedades de campo (incl. offline sync), relevos, incidencias en ruta, evidencia operativa.
- **Puede ver:** viajes activos asignados a su perímetro.
- **Denegado:** emitir OC de compras; mutar DIAN; override de hard-lock contable.

#### Procesos y Flujos Paso a Paso

1. Revisar tablero de unidades en campo.
2. Registrar novedad (retraso, relevo, falla).
3. Sincronizar cola offline cuando haya uplink.
4. Coordinar relevo PESV-compliant con Despacho.
5. Adjuntar evidencia fotográfica / checklist.
6. Escalar incidentes a QHSE / Centro de Control.

#### Alertas y Bloqueos (Hard-Stops)

- Sync conflictosa: no sobrescribir auditoría del servidor sin revisión.
- Conductor en fatiga: relevo obligatorio antes de continuar.
- Signal lost prolongado: Watchtower toma prioridad de monitoreo.

---

### 13. Centro de Control / Watchtower — `OPERADOR_CENTRO_CONTROL`

**Home:** `/centro-control/dashboard` · **Demo:** `centrocontrol@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** monitoreo 24/7 IoT/telemetría, alertas de ruta, correlacionar señales, escalar eventos.
- **Puede ver:** mapa vivo, SOS, geocercas, estado de uplink.
- **Denegado:** crear OC; pagar; alterar roles; mutar periodos contables.

#### Procesos y Flujos Paso a Paso

1. Verificar System Status: Nominal | Alert | Offline.
2. Atender cola de alertas por severidad.
3. Contactar campo / conductor ante desviación.
4. Registrar bitácora de incidente Watchtower.
5. Coordinar con Patio si hay retorno anticipado.
6. Cerrar alerta cuando telemetría vuelva a Nominal.

#### Alertas y Bloqueos (Hard-Stops)

- SOS / geocerca crítica: protocolo de escalamiento inmediato.
- Uplink Offline: no asumir posición; marcar Signal lost — retrying uplink.
- Eventos IoT de combustible anómalo: escalar a Control Interno.

---

### 14. Control Interno Forense — `AUDITOR_CONTROL_INTERNO`

**Home:** `/control-interno/dashboard` · **Demo:** `controlinterno@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** auditar trails inmutables, revisar anomalías (fuel, inventario, accesos), emitir hallazgos.
- **Puede ver:** logs forenses, correlaciones cross-módulo (solo lectura mutativa).
- **Denegado:** borrar evidencia; “arreglar” datos operativos sin ticket; operar caja.

#### Procesos y Flujos Paso a Paso

1. Abrir hub forense y filtrar por dominio (fuel, patio, taller, tesorería).
2. Seleccionar evento y cadena de evidencia.
3. Correlacionar actor, timestamp y dispositivo.
4. Abrir hallazgo con severidad y área responsable.
5. Seguir remediación hasta cierre documentado.
6. Escalar a Revisoría / Presidencia si hay fraude material.

#### Alertas y Bloqueos (Hard-Stops)

- Evidencia inmutable: no edición destructiva.
- Anomalía de combustible / inventario: bloqueo preventivo recomendado a Operaciones/Taller.
- Acceso denegado a mutaciones operativas (by design).

---

### 15. Presidencia / Founder's Canvas — `PRESIDENTE`

**Home:** `/presidencia/dashboard` · **Demo:** `presidencia@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** lectura directiva consolidada, DEFCON / señales de gobierno, interacción de alto nivel (voz/IA según despliegue).
- **Puede ver:** KPIs cross-área, alertas críticas agregadas.
- **Denegado:** escritura mutativa en dominios operativos (despacho, pagos, OT); no es “superusuario de flota”.

#### Procesos y Flujos Paso a Paso

1. Revisar Founder's Canvas al inicio (flota, margen, riesgo).
2. Identificar alertas DEFCON / críticas.
3. Escalar a Gerencia General o área dueña.
4. Solicitar brief forense a Control Interno si aplica.
5. Registrar decisión directiva (solo gobierno, no mutación de base operativa).
6. Cerrar seguimiento cuando el área confirme remediación.

#### Alertas y Bloqueos (Hard-Stops)

- Modo solo lectura sobre operaciones.
- Intentos de mutación operativa: denegados por RBAC.
- Escalamiento obligatorio ante stop de flota / fraude / litigio material.

---

### 16. Vinculaciones / Smart Onboarding — `GESTOR_VINCULACIONES`

**Home:** `/vinculaciones/dashboard` · **Demo:** `vinculaciones@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** onboarding de conductores/terceros, background check, documentación de vinculación, transición a bloque operativo.
- **Puede ver:** estado de candidatos, listas restrictivas, checklist documental.
- **Denegado:** despachar unidad sin aptitud; pagar proveedores; editar DIAN.

#### Procesos y Flujos Paso a Paso

1. Crear expediente de vinculación (persona / tercero).
2. Ejecutar background check / listas.
3. Cargar documentos (licencia, exámenes, contratos).
4. Resolver hallazgos o marcar bloqueo.
5. Aprobar transición a estado operativo apto.
6. Entregar a RRHH/Operaciones según tipo.

#### Alertas y Bloqueos (Hard-Stops)

- Background check fallido / lista restrictiva: `to-block` — no habilitar operación.
- Documentos incompletos: no transición a apto.
- Licencia vencida: mismo efecto que compliance de flota al asignar.

---

### 17. Comercial — Director, Gestor y Coordinación

#### 17.0 Dirección Comercial B2B — `DIRECTOR_COMERCIAL`

**Home:** `/comercial/director/dashboard` · **Demo:** `direccioncomercial@inretrans.com`

##### Objetivo RBAC

- Pipeline B2B/B2G, win/loss, precios estratégicos, gobierno comercial.
- **Denegado:** despacho directo; tesorería; hard-lock contable.

##### Flujo

1. Revisar pipeline y forecast.
2. Priorizar deals estratégicos / SECOP cuando aplique.
3. Autorizar excepciones de precio según política.
4. Marcar oportunidades Won → contrato.
5. Coordinar handoff a Operaciones.
6. Auditar margen con CFO.

##### Hard-Stops

- Cliente SARLAFT HIGH/BLOCKED: no alta efectiva.
- Won sin contrato/NIT válido: no genera viaje operativo limpio.

#### 17.1 Gestor Comercial — `GESTOR_COMERCIAL`

**Home:** `/comercial/gestor/dashboard` · **Demo:** `ventas@inretrans.com`

##### Objetivo RBAC

- Ejecución de ventas: cotizaciones, seguimiento, conversión.
- **Denegado:** override de compliance de flota; pagos.

##### Flujo

1. Alta/actualización de lead o cliente.
2. Crear cotización.
3. Negociar y versionar oferta.
4. Convertir a ganado cuando aplique.
5. Disparar generación de contrato / viaje borrador.
6. Escalar a Director excepciones.

##### Hard-Stops

- SARLAFT bloquea alta/pago asociado.
- Cotización sin ítems/ruta: no despachable.

#### 17.2 Coordinador Comercial — `COORDINADOR_COMERCIAL`

**Home:** `/comercial/coordinador/dashboard` · **Demo:** `coordinacioncomercial@inretrans.com`

##### Objetivo RBAC

- SLA de gestión comercial, licitaciones, coordinación de equipo de ventas.
- **Denegado:** mutar OT taller; reabrir periodos locked.

##### Flujo

1. Revisar SLA de oportunidades abiertas.
2. Asignar gestores y plazos.
3. Seguir licitaciones / entregables.
4. Intervenir deals en riesgo de SLA.
5. Reportar a Dirección Comercial.
6. Cerrar ciclo con handoff operativo.

##### Hard-Stops

- SLA vencido: alerta de gestión (no inventa precio).
- Deal sin documentación mínima: no avanza a Won limpio.

---

### 18. Gerencia General — `GERENTE_GENERAL`

**Home:** `/gerencia/dashboard` · **Demo:** `gerenciageneral@inretrans.com` · **PIN:** `258014`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** hub omnisciente, What-If, priorización inter-áreas, acciones ejecutivas con PIN/OTP.
- **Puede ver:** SSoT gerencial (ops, finanzas, riesgo, comercial).
- **Denegado:** actuar como Revisoría (no hard-lock contable propio); no bypass SARLAFT sin traza.

#### Procesos y Flujos Paso a Paso

1. Revisar prioridades del día (bloqueos despacho, OT, CxC).
2. Ejecutar What-If si se evalúa escenario de capacidad/margen.
3. Asignar follow-up a área dueña.
4. Confirmar acciones sensibles con PIN `258014` (o OTP según pantalla).
5. Verificar cierre de alertas antes de fin de jornada.
6. Escalar a Presidencia solo lo material.

#### Alertas y Bloqueos (Hard-Stops)

- Sin PIN/OTP válido: acción ejecutiva denegada.
- `complianceBlocked` masivo: no forzar despacho silencioso.
- Periodo `HARD_LOCKED`: no ordenar asientos al Contador sobre ese periodo.

---

### 19. Jurídico — `DIRECTOR_JURIDICO`

**Home:** `/juridico/dashboard` · **Demo:** `juridico@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** expedientes legales, contratos, litigios, custodia jurídica, opiniones de riesgo legal.
- **Puede ver:** Data Room autorizado, SARLAFT contextual, obligaciones.
- **Denegado:** operar caja; despachar flota; borrar evidencia forense.

#### Procesos y Flujos Paso a Paso

1. Abrir o actualizar expediente.
2. Vincular contrato / demanda / autoridad.
3. Solicitar documentos a Archivo.
4. Emitir concepto o medida cautelar interna.
5. Coordinar con Comercial/Vinculaciones cláusulas.
6. Cerrar o archivar con estado jurídico.

#### Alertas y Bloqueos (Hard-Stops)

- Expediente en litigio: restricciones de mutación documental.
- Cláusula / NIT inválido: bloquea cierre comercial limpio.
- Orden de autoridad: prioriza sobre operación rutinaria (escalar Gerencia).

---

### 20. Revisoría Fiscal — `REVISOR_FISCAL`

**Home:** `/revisoria-fiscal/dashboard` · **Demo:** `revisoriafiscal@inretrans.com`

#### Objetivo del Rol y Alcance RBAC

- **Puede:** auditoría forense financiera, hallazgos, **hard-lock de periodo** (`HARD_LOCKED`), lectura inmutable.
- **Puede ver:** libros, trails, cierres.
- **Denegado:** editar asientos “para corregir”; operar módulos mutativos de flota.

#### Procesos y Flujos Paso a Paso

1. Seleccionar periodo a revisar.
2. Inspeccionar balance, DIAN, CxC/CxP materiales.
3. Registrar hallazgo con evidencia.
4. Aplicar hard-lock de periodo cuando proceda.
5. Seguir remediación de Contabilidad/Tesorería.
6. Informar a Presidencia hallazgos críticos.

#### Alertas y Bloqueos (Hard-Stops)

- `HARD_LOCKED`: Contabilidad/Auxiliar sin escritura en el periodo.
- Intentos de mutación: guard de solo lectura / rechazo.
- Hallazgo abierto material: no “dar por cerrado” el periodo sin traza.

---

### 21. Taller 4.0 — Coordinador, Almacén y Mecánico

#### 21.0 Coordinador Taller — `COORDINADOR_TALLER`

**Home:** `/taller/coordinador/dashboard` · **Demo:** `coordinadortaller@inretrans.com`

##### Objetivo RBAC

- OT, priorización, QC, liberación a logística, antifraude de proceso.
- **Denegado:** pagar OC; hard-lock contable; bypass QC.

##### Flujo

1. Abrir OT (placa, falla, prioridad).
2. Asignar mecánico y bahía.
3. Autorizar solicitud de repuestos a Almacén.
4. Supervisar evidencias visuales / QR.
5. Ejecutar QC antes de cerrar.
6. Liberar unidad a Logística solo si QC OK.

##### Hard-Stops

- QC incompleto: **no liberar a logística**.
- Evidencia visual faltante: OT no cierra.
- Unidad con docs vencidos: sigue `complianceBlocked` en despacho aunque taller libere mecánicamente.

#### 21.1 Almacén Taller — `AUXILIAR_ALMACEN_TALLER`

**Home:** `/taller/almacen/dashboard` · **Demo:** `almacentaller@inretrans.com`

##### Objetivo RBAC

- Despacho de partes, inventario, recepción vs OC, trazabilidad QR.
- **Denegado:** cerrar QC final; pagar proveedores.

##### Flujo

1. Recibir solicitud de partes desde OT.
2. Verificar stock / generar pedido a Compras si falta.
3. Despachar con evidencia (QR / CV antifraude).
4. Registrar devoluciones.
5. Conciliar con 3-Way de Compras.
6. Alertar mermas anómalas a Control Interno.

##### Hard-Stops

- Parte sin matching / sin evidencia: no despacho limpio.
- Stock negativo no permitido.

#### 21.2 Mecánico — `MECANICO`

**Home:** `/taller/mecanico` · **Demo:** `mecanico@inretrans.com`

##### Objetivo RBAC

- Ejecutar OT, cargar evidencia fotográfica, consumir partes autorizadas.
- **Denegado:** liberar a logística sin QC del coordinador; mutar compras/tesorería.

##### Flujo

1. Tomar OT asignada.
2. Diagnosticar y documentar con fotos.
3. Solicitar / consumir repuestos autorizados.
4. Registrar mano de obra y checklist.
5. Entregar a Coordinador para QC.
6. Corregir no conformidades QC.

##### Hard-Stops

- Sin evidencia visual: no avance de etapa.
- Velocidad de fraude (cambio de parte sin QR): rechazo de consumo.

---

### 22. Patio / Smart Yard — Coordinador y Auxiliar

#### 22.0 Coordinador Patio — `COORDINADOR_PATIO`

**Home:** `/patio/dashboard` · **Demo:** `coordinadorpatio@inretrans.com`

##### Objetivo RBAC

- Gateways, LPR, cupos de patio, excepciones de acceso, correlación viaje activo.
- **Denegado:** despachar servicio comercial completo; pagar; hard-lock contable.

##### Flujo

1. Monitorear ocupación y colas de ingreso/salida.
2. Validar lecturas LPR vs viajes activos.
3. Autorizar/denegar excepciones documentadas.
4. Coordinar con Despacho salidas programadas.
5. Revisar incidentes de gate / IoT.
6. Escalar fraudes de acceso a Control Interno.

##### Hard-Stops

- **LPR sin viaje activo:** acceso denegado o cuarentena.
- Unidad `complianceBlocked`: no salida operativa.
- Alcoholimetría requerida y fallida: no gate-out.

#### 22.1 Auxiliar Patio — `AUXILIAR_PATIO`

**Home:** `/patio/yard-app` · **Demo:** `auxiliarpatio@inretrans.com`

##### Objetivo RBAC

- Operación de yard-app en campo: registro de movimientos, apoyo a LPR, checklist de patio.
- **Denegado:** override masivo de política LPR; mutar finanzas.

##### Flujo

1. Abrir Yard App en puesto de gate.
2. Confirmar placa leída / manual asistido.
3. Verificar viaje activo en sistema.
4. Registrar ingreso/salida con timestamp.
5. Adjuntar novedad (daño, sellos, combustible visual).
6. Escalar al Coordinador si hay mismatch.

##### Hard-Stops

- Sin viaje activo: hard-stop de acceso.
- Mismatch placa vs orden: no abrir gate.

---

### 23. Pilot (Conductor) y Subgerencia

#### 23.0 Conductor / FSG Pilot — `CONDUCTOR`

**Home:** `/pilot` · **Demo:** `conductor@inretrans.com`

##### Objetivo RBAC

- App de conductor: viaje asignado, checklist, telemetría de cabina, evidencias de ruta.
- **Denegado:** reasignarse viajes ajenos; mutar precios; acceder a módulos backoffice.

##### Flujo

1. Login Pilot y ver viaje del día.
2. Completar pre-trip / alcoholimetría según protocolo.
3. Iniciar servicio solo si apto.
4. Seguir navegación y reportar novedades.
5. Cerrar tramos / evidencias en destino.
6. Gestionar viáticos según reglas (sin dejar pendientes que disparen hard-stop).

##### Hard-Stops

- **Velocidad > 15 km/h:** lock de UI Pilot (no operar pantallas en movimiento).
- Docs/fatiga/alcoholimetría: no inicio de viaje.
- Viáticos pendientes: pueden bloquear cierre/liquidación.
- Signal lost: reintentar uplink; no inventar posición.

#### 23.1 Subgerencia — `SUB_GERENTE`

**Home:** `/subgerencia/dashboard` · **Demo:** `subgerencia@inretrans.com`

##### Objetivo RBAC

- Ejecución táctica bajo Gerencia: seguimiento de planes, desbloqueo operativo coordinado, priorización diaria.
- **Puede ver:** tablero táctico multi-área.
- **Denegado:** PIN de Gerencia General (salvo delegación explícita); hard-lock revisoría; mutación contable profunda.

##### Flujo

1. Revisar agenda táctica heredada de Gerencia.
2. Verificar bloqueos abiertos (despacho, taller, CxC).
3. Coordinar responsables y plazos.
4. Confirmar remediaciones en campo/backoffice.
5. Reportar a Gerencia General estado Nominal/Alert.
6. Escalar solo excepciones que requieran PIN ejecutivo.

##### Hard-Stops

- Acciones que exigen PIN `258014`: deben pasar por Gerente General.
- No bypass de `complianceBlocked`, SARLAFT ni `HARD_LOCKED`.

---

## D. Referencia Rápida de Navegación

| Área | Ruta típica |
|------|-------------|
| Plataforma | `/plataforma` |
| Recepción | `/recepcion/dashboard` |
| TI | `/ti/dashboard` |
| Archivo | `/archivo/dashboard` |
| Contabilidad | `/contabilidad/*/dashboard` |
| Tesorería | `/tesoreria` |
| CFO | `/finanzas/cfo/dashboard` |
| QHSE | `/qhse/dashboard` |
| Compras | `/compras/dashboard` |
| Operaciones | `/operaciones/{director\|despacho\|campo}/dashboard` |
| Watchtower | `/centro-control/dashboard` |
| Control Interno | `/control-interno/dashboard` |
| Presidencia | `/presidencia/dashboard` |
| Vinculaciones | `/vinculaciones/dashboard` |
| Comercial | `/comercial/{director\|gestor\|coordinador}/dashboard` |
| Gerencia | `/gerencia/dashboard` |
| Jurídico | `/juridico/dashboard` |
| Revisoría | `/revisoria-fiscal/dashboard` |
| Taller | `/taller/{coordinador\|almacen}/dashboard`, `/taller/mecanico` |
| Patio | `/patio/dashboard`, `/patio/yard-app` |
| Pilot | `/pilot` |
| Subgerencia | `/subgerencia/dashboard` |

**Atajos:** `Cmd/Ctrl + K` búsqueda · `Cmd/Ctrl + /` guía `[ ? ]` · `Esc` cierra paneles.

---

## E. Glosario Operativo

| Término | Significado |
|---------|-------------|
| Fleet Operations | Operación diaria de flota y servicios |
| Live Telemetry | Señal GPS/IoT en tiempo real |
| Signal Strength / Signal lost | Calidad de uplink; pérdida con reintento |
| Hard-Stop | Bloqueo duro de proceso por compliance o seguridad |
| `complianceBlocked` | Unidad no apta por documentación crítica |
| `HARD_LOCKED` | Periodo contable sellado por Revisoría |
| 3-Way Matching | OC + recepción + factura alineados |
| PESV | Plan Estratégico de Seguridad Vial |
| LPR | Lectura automática de placas en gate |
| QC | Control de calidad de OT antes de liberar |
| System Status | Nominal \| Alert \| Offline |

---

*Documento operativo INRETRANS OS — uso interno y demos. Contraseñas de prueba no deben reutilizarse en producción.*
