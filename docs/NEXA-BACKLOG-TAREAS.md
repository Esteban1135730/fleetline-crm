# NEXA — Backlog en lenguaje claro (2 sprints)

Board: [SCRUM / inredesoft](https://inredesoft.atlassian.net/jira/software/projects/SCRUM/boards/1)  
**Esteban** = reglas y datos del sistema · **Samuel** = pantallas que ve la gente

Cada tarea en Jira ahora trae: *¿de qué se trata?*, *por qué importa*, *cuándo está listo* y un *glosario*.

---

## Sprint 1 — Cimientos: permisos, ventas y portería

**Epic SCRUM-41** — Al terminar: demo de vender con PDF + portería ENTRA/NO ENTRA + menú por cargo.

| Key | Quién | En una frase |
|-----|-------|----------------|
| SCRUM-42 | Esteban | Definir **6 cargos** y qué puede ver cada uno |
| SCRUM-43 | Esteban | Guardar clientes, cotizaciones y generar **PDF** |
| SCRUM-44 | Esteban | Preparar en la base los **bloqueos** y el camino venta→cobro |
| SCRUM-45 | Esteban | Reglas de portería: ¿entra o no? (placa/cédula) |
| SCRUM-46 | Samuel | Pantalla Comercial: tablero, fichas, cotizador, PDF |
| SCRUM-47 | Samuel | Pantalla portería grande: ENTRA / NO ENTRA |
| SCRUM-48 | Samuel | Menú solo con **6 áreas**, según el cargo |
| SCRUM-49 | Samuel | Crear/editar usuarios con esos 6 cargos |

**Orden recomendado:** primero cargos y base (42, 44) → datos Comercial y portería (43, 45) → pantallas (48, 49, 46, 47).

---

## Sprint 2 — Operación en vivo + bloqueos

**Epic SCRUM-50** — Al terminar: torre con mapa + conductor enviando ubicación + frenos de seguridad/plata/cumplimiento.

### Operación

| Key | Quién | En una frase |
|-----|-------|----------------|
| SCRUM-52 | Esteban | Datos de la torre: estado del viaje y dónde está la flota |
| SCRUM-51 | Esteban | Guardar estado del conductor y su ubicación |
| SCRUM-53 | Samuel | Pantalla torre: tablero + mapa de buses |
| SCRUM-54 | Samuel | App del conductor: entrar, marcar estado, enviar ubicación |

### Bloqueos y reglas

| Key | Quién | En una frase |
|-----|-------|----------------|
| SCRUM-30 | Esteban | Decidir si al ganar un contrato se crea solo el viaje |
| SCRUM-24 | Esteban | No asignar viaje si hay fatiga, papeles mal o bus chico |
| SCRUM-25 | Esteban | No vender a clientes con **más de 60 días** de mora |
| SCRUM-27 | Esteban | Aprobaciones de Gerencia que **sí cambien** el proceso (PIN) |
| SCRUM-28 | Esteban | Bloquear en todo el sistema a personas/empresas SARLAFT |
| SCRUM-33 | Samuel | Pantalla para liberar SARLAFT y mostrar avisos |
| SCRUM-37 | Samuel | Ver mora en Tesorería y notificar cobro |

**Orden recomendado:** decisión 30 → torre/conductor (52, 51, 53, 54) → bloqueos (24, 25, 28, 27) → pantallas Samuel (33, 37).

---

## Palabras que se usan mucho

| Palabra | Significado simple |
|---------|-------------------|
| **Cargo / rol** | Tipo de usuario (Comercial, Portería…) |
| **Embudo** | Etapas del cliente hasta cerrar la venta |
| **Cotización** | Oferta de precio |
| **Portería** | Control de quién entra al patio/sede |
| **Torre de control** | Pantalla central de Operaciones |
| **Flota** | Todos los buses/vehículos |
| **Mora** | Cliente atrasado en el pago |
| **Cartera** | Dinero que nos deben |
| **SARLAFT** | Control de riesgo / listas antilavado |
| **Hard-stop / freno** | El sistema **no deja** hacer la acción |
| **PIN** | Clave corta de aprobación del jefe |
| **Badge** | Etiqueta visual de aviso |

---

## Backlog (después de los 2 sprints)

Queda en Jira con prefijo `[BACKLOG]`: Compras, nómina→tesorería, QHSE, parqueadero, Presidencia, Revisoría, Contabilidad, polish UX, etc. No entran en Sprint 1 ni 2.
