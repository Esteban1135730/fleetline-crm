/**
 * Zonas predefinidas para protocolo de crisis (Presidencia / DEFCON).
 * No hay catálogo en DB: lista operativa mínima reutilizable FE/API.
 */
export const CRISIS_ZONE_PRESETS = [
  "Centro Bogotá",
  "Norte Bogotá",
  "Sur Bogotá",
  "Occidente Bogotá",
  "Oriente Bogotá",
  "Kennedy",
  "Bosa",
  "Ciudad Bolívar",
  "Suba",
  "Engativá",
  "Usaquén",
  "Chapinero",
  "Soacha",
  "Chía",
  "Cota",
  "Funza",
  "Mosquera",
  "Madrid (Cund.)",
  "Zipaquirá",
  "Facatativá",
  "Terminal Salitre",
  "Terminal del Norte",
  "Corredor Bogotá–Medellín",
  "Corredor Bogotá–Barranca",
] as const;

export type CrisisZonePreset = (typeof CRISIS_ZONE_PRESETS)[number];

const PRESET_SET = new Set<string>(CRISIS_ZONE_PRESETS);

export function isCrisisZonePreset(value: string): value is CrisisZonePreset {
  return PRESET_SET.has(value.trim());
}

export function normalizeCrisisZones(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const z = String(item || "").trim();
    if (!z || !PRESET_SET.has(z) || seen.has(z)) continue;
    seen.add(z);
    out.push(z);
  }
  return out;
}
