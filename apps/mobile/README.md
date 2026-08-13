# Fleetline OS — App móvil (`@fsg/mobile`)

Expo 54 · React Native · Offline-first multi-rol.

## Roles

| Rol API | Home |
|---------|------|
| `conductor` | Viajes, preoperacional, novedades, POD, GPS |
| `mecanico` | OTs, cronómetro, repuestos, evidencia |
| `auxiliar_patio` / `coordinador_patio` | Talanquera LPR/QR, inspección |
| `coordinador_campo` | Auditorías, abordaje offline |

## Arranque

```bash
pnpm install
pnpm --filter @fsg/api dev
pnpm --filter @fsg/mobile start
```

`EXPO_PUBLIC_API_URL` opcional (default: host LAN Metro `:4000`).

## Offline

Cola AsyncStorage (`fleetline_sync_queue_v1`) + NetInfo. Banner **Modo Offline / Sincronizando**. Abordajes usan `POST /api/v1/operaciones/campo/abordaje-manual/sync`.

## Auth

JWT en SecureStore · `POST /auth/refresh` renovación silenciosa · 401 → logout.
