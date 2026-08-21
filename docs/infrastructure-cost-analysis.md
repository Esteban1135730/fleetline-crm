# Análisis de costos de infraestructura y operación — Fleetline / Inretrans OS

**Fecha:** 2026-08-21  
**Rol:** Solutions Architecture + FinOps  
**TRM base:** $4.100 COP / USD  
**Código auditado:** monorepo `fleetline-crm` (NestJS Express + Next.js + Prisma + Compose prod)

---

## 0. Resumen ejecutivo

| Pregunta | Respuesta corta |
|----------|-----------------|
| ¿Cloud Run a ~$45 USD/mes ($184.500 COP) es viable **hoy**? | **No**, sin refactor. WebSockets Socket.io, crons in-process y uploads en disco local impiden scale-to-zero / multi-réplica seguro. |
| ¿El presupuesto nube $746k–$906k COP/mes es suficiente? | **Sí**, e incluso holgado si se mantiene **VPS + R2** (recomendado) o un híbrido GCP mínimo. |
| ¿Redis es imprescindible? | **No** en el código actual (solo healthcheck Compose). Es coste muerto hasta Bull/caché/adapter WS. |
| ¿Object storage R2? | **Sí, prioritario** antes de crecer usuarios: hoy todo va a volumen Docker local. |
| Margen 38–40% a $17.760 COP/usuario | Sostenible hasta ~600 usuarios activos con el plan híbrido; el riesgo no es la nube sino **soporte L1/L2** en el COGS. |

**Stack real en producción hoy (VPS `76.13.101.203`):** Postgres 16 + Redis 7 (casi unused) + API Nest + Web Next, puertos 3010/4010, uploads en `fleetline_uploads`.

---

## 1. Validación del modelo comercial (referencia)

| Concepto | COP/mes | USD/mes (@4.100) |
|----------|---------|------------------|
| Nube estimada GCP | $746.200 | ~$182 |
| Nube estimada AWS | $906.100 | ~$221 |
| COGS total (infra + L1/L2 + DevOps + 10%) | ~$6.539.500 | ~$1.595 |
| Facturación objetivo (neto, + IVA aparte) | $10.660.000 | ~$2.600 |
| Margen bruto objetivo | ~38–40% | — |
| Precio / usuario | ~$17.760 + IVA | ~$4,33 |

**Asientos implícitos:** $10.660.000 ÷ $17.760 ≈ **600 usuarios** facturables.

**Implicación FinOps:** la infraestructura cloud del modelo (~$182–221 USD) es **&lt;15%** del COGS. El margen se juega en soporte humano, no en micro-optimizar 0,2 vCPU. Aun así, hay que evitar trampas de egress S3 y DB oversize.

---

## 2. Hallazgos técnicos del código

### A. Cómputo (API / Web)

| Ítem | Estado en repo |
|------|----------------|
| Runtime | NestJS 11 + **Express** (`NestExpressApplication`) — no Fastify |
| Stateless | **Parcialmente.** JWT sin sesión server-side; pero **Throttler in-memory**, **EventEmitter** dominio, **3 crons** en el mismo proceso, **Socket.io** en `/logistics` y `/escolar` |
| WebSockets | `logistics.gateway.ts`, `escolar.gateway.ts` — conexiones largas |
| Kafka | `kafkajs` opcional (`KAFKA_BROKERS`); en prod Compose **no hay broker** → noop + EventEmitter |
| Jobs | `@Cron` midnight compliance (hasta 5.000 vehículos), RRHH licencias, préstamos archivo 07:00 — **todo dentro de `fleetline-api`** |
| Límites Compose | **Ningún** `mem_limit` / `cpus` en `docker-compose.prod.yml` |

**Cloud Run / App Runner:** no recomendado como destino único hasta:

1. Extraer crons a Cloud Scheduler + Cloud Run Jobs (o cron en VPS).
2. Adapter Redis de Socket.io **o** servicio WS dedicado siempre-on.
3. Object storage (R2/GCS) en lugar de volumen local.
4. Quitar `depends_on: redis` o usarlo de verdad (rate-limit / pubsub).

Con eso, un Cloud Run **siempre min-instances=1** (por WS) deja de “escalar a cero” y el techo de **$45 USD** se vuelve frágil (egress + instancia mínima + Cloud SQL).

**Sizing contenedor API (recomendado):**

| Perfil | vCPU | RAM | Notas |
|--------|------|-----|-------|
| VPS / Compose (hoy–600 users) | 1 | **1 GB** (mín. 768 MB) | Nest + Prisma + Socket.io + ExcelJS puntual |
| Burst reportes / import Excel | 1–2 | 1,5–2 GB | Pico en RRHH import / dashboards |
| Web Next standalone | 0,5–1 | 512 MB–1 GB | Estático + SSR ligero |

### B. Base de datos y caché

| Métrica | Valor |
|---------|-------|
| Modelos Prisma | ~150 |
| Índices `@@index` | ~411 (buena base) |
| `findMany` en API | ~259 |
| Sin `take` (sin paginar) | **~137 (~53%)** — riesgo de CPU DB |
| Hotspots | `listTrips` sin límite (+ snapshot WS), nightly compliance, dashboards/comercial/contabilidad |

**Redis:** `REDIS_URL` en Compose; **cero** `ioredis` / Bull / BullMQ en `apps/api`. Solo probe NOC (`ti/noc-monitoring.service.ts`).  
→ Se puede **eliminar Redis del stack prod** (ahorro RAM ~50–100 MB + simplificar) o dejarlo para fase 2 (caché trips + adapter WS).

**Dimensionamiento DB:**

| Escenario | Motor | Justificación |
|-----------|-------|---------------|
| ≤300 usuarios / 1 org | Postgres en **mismo VPS** (actual) o Cloud SQL **db-f1-micro** / **db.t4g.micro** | ~150 modelos pero tráfico operativo, no analytics pesado |
| 300–600 usuarios | **db-g1-small** / **db.t4g.small** (1–2 GB RAM) | Índices OK; paginar findMany es más barato que subir instancia |
| 1.000+ usuarios / multi-tenant fuerte | small→medium + read replica solo si reportes lo exigen | No saltar a high-mem por defecto |

`db-f1-micro` es aceptable **solo** tras paginar listados y acotar nightly jobs; si no, la CPU compartida se satura con un `listTrips` unbounded.

### C. Almacenamiento y transferencia

| Ítem | Estado |
|------|--------|
| Estrategia actual | Multer → disco `/app/uploads` → volumen `fleetline_uploads` |
| S3 / R2 / GCS SDK | **No integrado** |
| Endpoints upload | ~5 (archivo, SARLAFT evidence, RRHH docs/excel) |
| Límites | 5 MB (security helper); RRHH docs aún hasta 20 MB en un path |

**R2 ($0 egress) vs GCS/S3:** recomendación fuerte para el tope **$49.200 COP/mes (~$12 USD)**.  
Con 600 usuarios y evidencias (SOAT/FUEC/fotos taller), 50–200 GB acumulados son plausibles en 12–24 meses; el peligro en AWS/GCP no es el GB almacenado sino **egress** al servir PDFs/imágenes desde la API.

---

## 3. Plan técnico recomendado

### Opción A — **Híbrido recomendado (mejor margen)** ★

Mantener lo que ya corre en el VPS y externalizar solo lo que escala mal.

| Capa | Servicio | USD/mes est. | COP/mes @4.100 |
|------|----------|--------------|----------------|
| Cómputo API+Web+Postgres | VPS 4 vCPU / 8 GB (Contabo/Hetzner/ equiv.) | $15–35 | $61.500–$143.500 |
| Object storage | **Cloudflare R2** 100–200 GB + ops | $2–8 | $8.200–$32.800 |
| CDN / DNS / WAF | Cloudflare Free/Pro | $0–20 | $0–$82.000 |
| Backup offsite | R2 o Backblaze B2 (pg_dump diario) | $2–5 | $8.200–$20.500 |
| Redis | **Quitar** o Redis local 64 MB maxmemory | $0 | $0 |
| Kafka | No desplegar hasta multi-instancia | $0 | $0 |
| **Total infra** | | **~$25–70** | **~$102.500–$287.000** |

Encaja **muy por debajo** del presupuesto nube $746k–$906k COP y deja holgura para L1/L2.

**Disponibilidad:** single-AZ VPS → RTO/RPO con backups diarios + restore documentado (aceptable para canon SaaS flota Colombia fase 1). HA multi-región no está justificada al precio/usuario actual.

### Opción B — GCP “modelo comercial” (~$182 USD)

| Servicio | Spec | USD/mes approx. |
|----------|------|-----------------|
| Cloud Run API | 1 vCPU, 1 GiB, **min instances = 1** (WS) | $25–45 |
| Cloud Run Web | 0,5–1 vCPU, scale-to-zero OK | $5–15 |
| Cloud SQL Postgres | db-custom-1-3840 o db-g1-small | $50–90 |
| Memorystore Redis | **omitir** o Basic 1 GB solo si WS adapter | $0–35 |
| Cloud Storage / mejor **R2** | 100 GB | $2–5 (R2) / $5–15 (GCS+egress) |
| Cloud Scheduler (crons) | 3 jobs | &lt;$1 |
| Load Balancing / HTTPS | | $18–25 |
| **Total** | | **~$100–200** |

Viable **después** del refactor WS/cron/storage. Sin refactor, Cloud Run “barato a cero” **no aplica**.

### Opción C — AWS (~$221 USD)

Equivalente: ECS/Fargate o App Runner + RDS `db.t4g.small` + S3.  
**Sustituir S3 por R2** (o CloudFront+S3 con cuidado) para no romper el techo de storage/egress.

### Comparativa

| Criterio | VPS+R2 (A) | GCP (B) | AWS (C) |
|----------|------------|---------|---------|
| Coste infra vs presupuesto | ★★★★★ | ★★★☆☆ | ★★☆☆☆ |
| Encaje código actual | ★★★★★ | ★★☆☆☆ | ★★☆☆☆ |
| Escalabilidad a 1.000 users | ★★★☆☆ | ★★★★☆ | ★★★★☆ |
| Complejidad ops | Baja | Media | Media-alta |
| **Recomendación fase actual** | **Sí** | Fase 2 | Fase 2 |

---

## 4. Optimizaciones de código (antes de subir de máquina)

### Prioridad P0 (coste DB / estabilidad)

1. **Paginación obligatoria** en listados (`parsePagination` ya existe en `apps/api/src/security/pagination.ts`):
   - `logistics.service` → `listTrips` / feeds WS (snapshot limitado o room por trip).
   - Fleet, trámites, comercial, contabilidad, dashboard.
2. **Nightly compliance:** no cargar 5.000 vehículos en un solo proceso; lotes de 200–500 + cursor.
3. **Límites Compose:**

```yaml
# Ejemplo a añadir en docker-compose.prod.yml
api:
  mem_limit: 1536m
  cpus: "1.5"
postgres:
  mem_limit: 1536m
  cpus: "1.0"
web:
  mem_limit: 768m
redis:  # o eliminar el servicio
  mem_limit: 128m
```

4. **Migrar uploads → R2** (SDK S3-compatible); DB solo guarda `fileRef` (`r2://…` o URL firmada).

### Prioridad P1 (transferencia / latencia)

5. Middleware **compression** (`compression` en Express) para JSON de listados.
6. Headers `Cache-Control` en web estáticos Next; firmas cortas para PDFs.
7. Reducir payload WS: emitir deltas GPS, no catálogo completo de trips.

### Prioridad P2 (cuando haya 2+ réplicas API)

8. Redis adapter Socket.io + Throttler storage Redis.
9. Extraer crons a proceso `worker` o Scheduler.
10. Kafka solo si hay consumidores cross-service reales (hoy EventEmitter basta).

### Índices

La base ya tiene ~411 índices. Antes de crear más: `EXPLAIN ANALYZE` en:

- trips por `organizationId + status + scheduledAt`
- archiveDocument por `organizationId + createdAt`
- vehicle compliance docs por vencimiento

Evitar índices redundantes (coste de escritura nightly).

---

## 5. Escalabilidad por usuarios vs margen

Supuestos:

- Precio: **$17.760 COP/usuario/mes**
- COGS fijo (soporte+DevOps+imprevistos, sin infra): ~$5.8M COP (del modelo: total 6.54M − infra ~0.75M)
- Infra variable según plan A (VPS+R2)

| Usuarios activos | Ingreso neto/mes | Infra est. (A) | COGS total est.* | Margen % |
|------------------|------------------|----------------|------------------|----------|
| 100 | $1.776.000 | $120.000 | ~$2.9M (soporte parcial) | Depende L1 |
| 300 | $5.328.000 | $180.000 | ~$4.5M | ~15–25% si L1 fijo alto |
| **600** | **$10.660.000** | **$200–280k** | **~$6.5M** | **~38–40%** (modelo) |
| 1.000 | $17.760.000 | $350–500k (VPS mayor o Cloud SQL small) | ~$9–10M | **~40–45%** si L1 no crece lineal |

\*El COGS de soporte no escala lineal 1:1 con usuarios si hay playbooks + autoservicio; si L1 escala 1 agente / 200 users, el margen en 100 users **no** cierra — el break-even comercial está cerca de los **~400–500** asientos, no de la infra.

**Conclusión:** la tarifa $17.760 mantiene el 40% **si** se factura el paquete ~600 users (o se reduce L1 en tramos bajos). La infra no es el cuello de botella hasta ~1.000 users **si** se pagina DB y se usa R2.

---

## 6. Variables de entorno y despliegue (proveedor recomendado: VPS + R2)

### Ya usadas (Compose prod)

```bash
POSTGRES_USER=
POSTGRES_PASSWORD=
POSTGRES_DB=fsg_crm
JWT_SECRET=                 # ≥32 chars
CORS_ORIGINS=https://crm.tudominio.com
NEXT_PUBLIC_API_URL=https://api.tudominio.com
NEXT_PUBLIC_WS_URL=https://api.tudominio.com
FLEETLINE_API_HOST_PORT=4010
FLEETLINE_WEB_HOST_PORT=3010
FLEETLINE_PG_HOST_PORT=127.0.0.1:55432
VAPID_*                     # web push opcional
FIELD_ENCRYPTION_KEY=
TREASURY_MFA_STATIC_OTP=
COOKIE_SECURE=true
FLEETLINE_ENV=production
```

### Añadir para R2 (fase storage)

```bash
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=fleetline-docs
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=https://docs.tudominio.com   # opcional vía custom domain
UPLOAD_DRIVER=r2                                # local | r2
```

### GCP fase 2 (si se migra)

```bash
DATABASE_URL=postgresql://...?sslmode=require
KAFKA_BROKERS=                                  # vacío = noop
REDIS_URL=                                      # solo con adapter WS
# Crons → Cloud Scheduler invocando POST /internal/jobs/* con secret
```

### Checklist despliegue VPS (actual)

```bash
cd /opt/fleetline/fleetline-crm
git pull origin main
# editar .env.production
docker compose -p fleetline -f docker-compose.prod.yml --env-file .env.production up -d --build
curl -s http://127.0.0.1:4010/health
```

**No:** `down -v`, seed en prod, `--accept-data-loss`.

### Checklist antes de Cloud Run

- [ ] Uploads en R2/GCS  
- [ ] Crons fuera del proceso API  
- [ ] Socket.io Redis adapter o servicio WS siempre-on  
- [ ] Redis opcional real (no solo depends_on)  
- [ ] Paginación en ≥95% de listados  
- [ ] Resource requests/limits definidos  

---

## 7. Mapa de costos vs rubros del presupuesto

| Rubro modelo | Tope COP | Plan A realista | Riesgo |
|--------------|----------|-----------------|--------|
| Cómputo (Cloud Run $45) | $184.500 | VPS $61k–$144k | Cloud Run min=1 puede superar $45 si WS 24/7 |
| Storage/egress | $49.200 | R2 $8k–$33k | S3/GCS egress rompe el tope |
| DB administrada | (dentro de $746k) | VPS local $0 extra / Cloud SQL $200k+ | Subir de micro sin paginar |
| Redis/Kafka | implícito | $0 | No contratar Memorystore/MSK aún |
| **Total nube modelo** | $746k–$906k | **$100k–$290k** | Holgura → reserva imprevistos / HA futura |

---

## 8. Roadmap FinOps (90 días)

| Semana | Acción | Impacto $ |
|--------|--------|-----------|
| 1–2 | Paginación listTrips + límites Compose | Baja CPU VPS |
| 2–4 | Integrar R2; dejar de crecer `fleetline_uploads` | Control storage |
| 4–6 | Evaluar apagar Redis en Compose | −RAM, −complejidad |
| 6–8 | Compression + acotar WS payloads | Menos ancho de banda |
| 8–12 | Diseñar job runner + WS strategy si se mira GCP | Desbloquea Cloud Run real |

---

## 9. Veredicto

1. **No forzar Cloud Run “a $45” con el código actual** — los WebSockets, crons y disco local lo contradicen.  
2. **Plan óptimo ahora:** VPS (ya desplegado) + **Cloudflare R2** + Cloudflare delante (TLS/WAF) + quitar o minimizar Redis. Coste infra **~15–40%** del presupuesto nube cotizado → protege el margen 38–40%.  
3. **Palanca técnica #1:** paginar `findMany` y acotar jobs nightly; no comprar una DB más grande.  
4. **Palanca comercial #1:** el COGS es soporte; la infra aguanta ~600–1.000 users con el sizing indicado si se aplican P0/P1.

---

*Documento generado a partir del estado del repo post-hardening `e3bbe9f` y Compose prod en VPS. Revisar cifras USD con precios on-demand del mes de cierre.*
