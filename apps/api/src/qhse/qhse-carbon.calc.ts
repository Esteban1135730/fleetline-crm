/** Factor default kg CO₂e por galón diésel (Colombia / flota pesada). */
export const DEFAULT_KG_CO2_PER_GALLON = 10.16;

export function computeCarbonFootprint(input: {
  gallons: number;
  distanceKm: number;
  kgCo2PerGallon?: number;
}) {
  const factor = input.kgCo2PerGallon ?? DEFAULT_KG_CO2_PER_GALLON;
  const gallons = Math.max(0, input.gallons);
  const distanceKm = Math.max(0, input.distanceKm);
  const kgCo2 = Number((gallons * factor).toFixed(2));
  const liters = Number((gallons * 3.78541).toFixed(2));
  const kmPerGallon =
    gallons > 0 ? Number((distanceKm / gallons).toFixed(2)) : null;
  const gCo2PerKm =
    distanceKm > 0 ? Number(((kgCo2 * 1000) / distanceKm).toFixed(1)) : null;

  return {
    gallons,
    liters,
    distanceKm,
    kgCo2,
    kgCo2PerGallon: factor,
    kmPerGallon,
    gCo2PerKm,
  };
}

/** Markup mínimo para exportación PDF (texto plano embebible). */
export function buildCarbonPdfMarkup(summary: {
  organizationName?: string;
  periodLabel: string;
  kgCo2: number;
  gallons: number;
  distanceKm: number;
  gCo2PerKm: number | null;
  npsAverage: number | null;
}): string {
  const lines = [
    "FLEETLINE · REPORTE ESG / HUELLA DE CARBONO",
    summary.organizationName
      ? `Organización: ${summary.organizationName}`
      : null,
    `Periodo: ${summary.periodLabel}`,
    `Emisiones CO₂: ${summary.kgCo2} kg`,
    `Combustible: ${summary.gallons} gal`,
    `Distancia: ${summary.distanceKm} km`,
    summary.gCo2PerKm != null
      ? `Intensidad: ${summary.gCo2PerKm} g CO₂/km`
      : null,
    summary.npsAverage != null
      ? `NPS promedio: ${summary.npsAverage}`
      : "NPS promedio: sin datos",
    `Generado: ${new Date().toISOString()}`,
  ].filter(Boolean);

  return lines.join("\n");
}
