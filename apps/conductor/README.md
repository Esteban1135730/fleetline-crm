# FSG Conductor (app móvil)

App Expo para conductores: login, listado de viajes asignados, cambio de estado, reporte de novedades y envío GPS en ruta.

## Requisitos

- Node 20+
- pnpm (monorepo)
- API en ejecución (`pnpm --filter @fsg/api dev`, puerto **4000** por defecto)
- Base de datos con seed (`pnpm db:seed`)

## Instalación

Desde la raíz del monorepo:

```bash
pnpm install
```

O solo esta app:

```bash
pnpm install --filter @fsg/conductor
```

## Variables de entorno

Crea `apps/conductor/.env` (opcional):

```env
EXPO_PUBLIC_API_URL=http://localhost:4000
```

| Entorno | URL recomendada |
|---------|-----------------|
| iOS Simulator / web | `http://localhost:4000` |
| Android Emulator | `http://10.0.2.2:4000` |
| Dispositivo físico | IP de tu PC, ej. `http://192.168.1.10:4000` |

Si no defines la variable, Android usa `10.0.2.2:4000` y el resto `localhost:4000`.

En la API, CORS ya incluye orígenes Expo (`8081`, `19006`). Puedes ampliar con `CORS_ORIGINS` en el `.env` raíz.

## Ejecutar

```bash
cd apps/conductor
npx expo start
```

Escanea el QR con Expo Go o pulsa `a` (Android) / `i` (iOS).

## Credenciales demo (seed)

| Email | Password | Conductor vinculado |
|-------|----------|---------------------|
| `conductor@fsg.co` | `fsg2026` | Luis Pérez — viaje TRP-1001 (IN_TRANSIT) |

## Endpoints usados

- `POST /auth/login`
- `GET /logistics/my-trips`
- `PATCH /logistics/trips/:id/status` — `IN_TRANSIT`, `COMPLETED`
- `PATCH /logistics/trips/:id/incident` — novedad (`notes`)
- `PATCH /logistics/gps/:vehicleId` — `{ lat, lng }` cada ~12s en ruta
