# Epic E01 — Expediente inmutable & SARLAFT (Sprint 1)

**PDFs origen:** ARCHIVO Y PAPELERIA · SARLAFT · base REVISOR FISCAL  
**Estado:** Done (piloto local 2026-07-30)  
**Agentes:** Copy · Design · Frontend · Backend  

---

## 1. Epic

> Como Oficial de Cumplimiento / Archivo, quiero una **bóveda documental con sello criptográfico** y un **motor SARLAFT** que impida dar de alta clientes o pagar CxP a sujetos de alto riesgo, para proteger la operación sin dependencias cloud externas (OCR/Kafka aún fuera de alcance).

### Fuera de alcance (visión PDF diferida)
- OCR / NLP / pgvector / S3  
- Scraping OFAC automático  
- Grafo Neo4j 3D  
- Hash-chain completo tipo blockchain entre eventos (base: hash por documento + AuditLog)

---

## 2. User Stories

### US-E01-01 — Hash SHA-256 al subir
**Como** auxiliar de archivo,  
**quiero** que cada archivo subido genere un hash SHA-256 inmutable,  
**para** poder demostrar integridad ante auditoría.

**DoD**
- [x] Campo `contentHash` en `ArchiveDocument`
- [x] Calculado en `POST /archivo/upload` desde el buffer/disco
- [x] Visible en UI en tipografía mono
- [x] `AuditLog` action `ARCHIVE_VAULT`

### US-E01-02 — Data Room con filtros
**Como** operador de archivo,  
**quiero** filtrar por categoría y buscar por título/tags/hash,  
**para** localizar expedientes sin OCR.

**DoD**
- [x] Query `?category=&q=` en listado
- [x] UI filtros + tabla con hash truncado + enlace descarga

### US-E01-03 — SARLAFT soft/hard block
**Como** sistema,  
**quiero** consultar el último chequeo por NIT/documento al crear cliente o pagar CxP,  
**para** no operar con riesgo `HIGH`/`BLOCKED` (override solo con `forceDespiteSarlaft` + rol privilegiado).

**DoD**
- [x] Servicio `SarlaftGuardService.assertClear(doc)`
- [x] Enganche en `POST /comercial/customers` y `PATCH /finance/invoices/:id/pay` (PAYABLE)
- [x] Mensaje copy: *"Sujeto en lista de riesgo — uplink bloqueado"*
- [x] Override: body `{ forceDespiteSarlaft: true }` roles `presidencia`|`finanzas` + AuditLog

### US-E01-04 — Log de auditoría de bóveda
**Como** revisor,  
**quiero** ver eventos de archivo (upload/delete) con hash y usuario,  
**para** trazabilidad read-only.

**DoD**
- [x] `GET /archivo/audit` últimos N eventos entity=ArchiveDocument
- [x] Panel en UI Archivo

---

## 3. Contrato API

### Archivo
| Método | Path | Notas |
|--------|------|-------|
| GET | `/archivo/documents?category=&q=` | Filtro metadatos |
| POST | `/archivo/upload` | multipart → `contentHash` SHA-256 |
| POST | `/archivo/documents` | metadatos sin file (hash null) |
| GET | `/archivo/audit` | AuditLog filtrado |
| POST | `/archivo/documents/:id/delete` | soft delete + audit |

### SARLAFT (existente + enforcement)
| Método | Path | Notas |
|--------|------|-------|
| GET/POST | `/sarlaft/checks` | CRUD chequeos |
| — | customers create | assertClear(nit) |
| — | invoices pay (CxP) | assertClear(supplierName/NIT en notes o supplier) |

### Zod (shared)
```ts
ArchiveUploadMetaSchema = z.object({
  title: z.string().min(1).optional(),
  category: z.enum([...]).optional(),
  tags: z.string().optional(),
});
```

---

## 4. Prisma schema diff

```prisma
model ArchiveDocument {
  // ...existing
  contentHash   String?   // SHA-256 hex
  uploadedById  String?
  uploadedBy    User?     @relation(...)
  byteSize      Int?
}
```

`User` + relation `archiveUploads ArchiveDocument[]`

---

## 5. Copy (@fleetline-copy)

| Key | Texto |
|-----|--------|
| vault_ok | DOCUMENTO SELLADO · HASH NOMINAL |
| vault_fail | Fallo de sellado criptográfico — reintentar uplink |
| sarlaft_block | Sujeto en lista de riesgo — uplink bloqueado |
| sarlaft_force | Override de cumplimiento registrado en auditoría |
| search_ph | Buscar título, tag o hash… |

---

## 6. Tasks por agente

| ID | Agente | Task |
|----|--------|------|
| T1 | Backend | Schema + hash upload + list filters |
| T2 | Backend | SarlaftGuardService + customers/finance |
| T3 | Backend | GET /archivo/audit |
| T4 | Frontend | Data Room UI + filtros + hash mono |
| T5 | Copy | Strings en UI archivo/sarlaft |
| T6 | Scrum | E2E local + checklist DoD |

---

## 7. Criterios de aceptación globales (DoD Sprint 1)

1. Subir PDF → respuesta incluye `contentHash` de 64 hex.  
2. Crear cliente con NIT marcado `BLOCKED` en SARLAFT → HTTP 400.  
3. Pagar CxP a supplier Doc bloqueado → HTTP 400.  
4. UI muestra filtros + hash + audit trail.  
5. `tsc` / API arranca local.  
6. **Sin `git push`.**
