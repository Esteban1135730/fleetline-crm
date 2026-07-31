# Epic E03 — Mantenimiento y patio (Sprint 3)

**PDFs:** TALLER · PARQUEADERO  
**Estado:** Planned (odómetro/OT ya en hard rules)

## Stories (resumen)
1. Odómetro al completar viaje → OT preventiva 10.000 km (ya existe).
2. Check-in/out parqueadero con **bahía** asignada (pendiente schema).
3. UI patio: mapa simple de bahías (sin LPR/IoT).

## Prisma diff pendiente
```prisma
model ParkingLog {
  // ...existing
  bayCode String?  // ej. A1, C4
}
```

## DoD
- Bahía obligatoria en check-in.
- OT preventiva verificable post-viaje largo.
- Sin git push.
