/**
 * SCRUM-44 — Mapa canónico de bloqueos (SSoT).
 * No inventa enums nuevos: documenta flags Prisma ya existentes
 * y el flujo venta → cobro esperado.
 */

export type BlockFlagDomain =
  | "cliente"
  | "proveedor"
  | "empleado"
  | "vehiculo"
  | "conductor"
  | "cxp"
  | "comercial_anticipo"
  | "contrato";

export type BlockFlagDef = {
  domain: BlockFlagDomain;
  model: string;
  field: string;
  meaning: string;
  hardStop: boolean;
};

/** Flags de bloqueo ya modelados en Prisma */
export const NEXA_BLOCK_FLAGS: readonly BlockFlagDef[] = [
  {
    domain: "cliente",
    model: "Customer",
    field: "sarlaftBlocked",
    meaning: "Cliente en lista / riesgo SARLAFT — no alta comercial libre",
    hardStop: true,
  },
  {
    domain: "proveedor",
    model: "Supplier",
    field: "sarlaftBlocked / paymentHardBlocked",
    meaning: "Proveedor bloqueado para OC o pago CxP",
    hardStop: true,
  },
  {
    domain: "empleado",
    model: "Employee",
    field: "sarlaftBlocked",
    meaning: "Persona bloqueada en vinculación / nómina",
    hardStop: true,
  },
  {
    domain: "vehiculo",
    model: "Vehicle",
    field: "complianceBlocked / nightRestricted",
    meaning: "Kill-switch documental (SOAT, TO, etc.)",
    hardStop: true,
  },
  {
    domain: "conductor",
    model: "Driver",
    field: "dispatchBlocked / blockReason",
    meaning: "Fatiga, papeles o capacidad — no despacho",
    hardStop: true,
  },
  {
    domain: "cxp",
    model: "PaymentHardBlock",
    field: "active",
    meaning: "Hard-block cambio de cuenta bancaria proveedor",
    hardStop: true,
  },
  {
    domain: "comercial_anticipo",
    model: "CommercialAdvancePaymentLink",
    field: "status != CONFIRMED",
    meaning: "Sin anticipo confirmado no se despacha viaje ligado",
    hardStop: true,
  },
  {
    domain: "contrato",
    model: "TransportContract",
    field: "budget/trip quota",
    meaning: "Cupo o vigencia agotada → CONTRACT_DISPATCH_DENIED",
    hardStop: true,
  },
] as const;

/**
 * Flujo venta → cobro (CxC). CxP (`PaymentSchedule`) es otro carril.
 *
 * Lead (CommercialDeal)
 *   → Cotización (Quote | CommercialIntelligentQuote + PDF)
 *   → Contrato (TransportContract + firma)
 *   → WON → RecurringBillingSchedule + Invoice RECEIVABLE (1ª cuota)
 *   → Cobro: finance markPaid | tesorería cartera/cruzar
 *   → Alterno: AdvancePaymentLink → confirmar-pago-tesoreria
 */
export const SALE_TO_COLLECTION_FLOW = [
  "CommercialDeal",
  "Quote|CommercialIntelligentQuote",
  "TransportContract",
  "RecurringBillingSchedule",
  "Invoice.RECEIVABLE",
  "markPaid|cartera.cruzar",
] as const;

/** Mora comercial: InvoiceStatus.OVERDUE (≥60 días → SCRUM-25 creditHold) */
export const COMMERCIAL_ARREARS_DAYS_HARD_STOP = 60;
