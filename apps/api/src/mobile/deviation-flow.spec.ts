import { evaluateTripControl } from "./geofence";

const TripStatus = {
  ASSIGNED: "ASSIGNED",
  IN_TRANSIT: "IN_TRANSIT",
  PENDING_SUPERVISOR_APPROVAL: "PENDING_SUPERVISOR_APPROVAL",
  COMPLETED: "COMPLETED",
} as const;

const TripDeviationAction = { START: "START", END: "END" } as const;
const TripDeviationStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

/**
 * Simula el contrato de MobileTripControlService.iniciar cuando el gate falla:
 * no marca IN_TRANSIT; crea desviación PENDING y status PENDING_SUPERVISOR_APPROVAL.
 */
function decideStartOutcome(input: {
  gps: { lat: number; lng: number };
  origin: { lat: number; lng: number };
  departAt: Date;
  serverNow: Date;
}) {
  const gate = evaluateTripControl({
    serverNow: input.serverNow,
    gps: input.gps,
    target: input.origin,
    scheduledAt: input.departAt,
    geofenceRadiusM: 300,
    timeToleranceMin: 30,
  });

  if (gate.ok) {
    return {
      status: "INICIADO" as const,
      tripStatus: TripStatus.IN_TRANSIT,
      deviation: null as null,
      gate,
    };
  }

  return {
    status: "PENDIENTE_APROBACION_SUPERVISOR" as const,
    tripStatus: TripStatus.PENDING_SUPERVISOR_APPROVAL,
    deviation: {
      action: TripDeviationAction.START,
      status: TripDeviationStatus.PENDING,
      previousStatus: TripStatus.ASSIGNED,
      reasonCodes: gate.violations.map((v) => v.code),
    },
    gate,
  };
}

function applySupervisorDecision(
  pending: {
    action: (typeof TripDeviationAction)[keyof typeof TripDeviationAction];
    previousStatus: string;
  },
  decision: "ACEPTAR" | "CANCELAR",
) {
  if (decision === "CANCELAR") {
    return {
      tripStatus: pending.previousStatus,
      trackingStarted: false,
      deviationStatus: TripDeviationStatus.REJECTED,
    };
  }
  return {
    tripStatus:
      pending.action === TripDeviationAction.START
        ? TripStatus.IN_TRANSIT
        : TripStatus.COMPLETED,
    trackingStarted: pending.action === TripDeviationAction.START,
    deviationStatus: TripDeviationStatus.APPROVED,
  };
}

describe("inicio fuera de radio/horario → PENDIENTE_APROBACION_SUPERVISOR", () => {
  const origin = { lat: 4.701, lng: -74.146 };
  const departAt = new Date("2026-08-06T15:00:00.000Z");

  it("fuera de geofence no inicia y queda pendiente de supervisor", () => {
    const out = decideStartOutcome({
      gps: { lat: 4.85, lng: -74.0 },
      origin,
      departAt,
      serverNow: new Date("2026-08-06T15:05:00.000Z"),
    });
    expect(out.status).toBe("PENDIENTE_APROBACION_SUPERVISOR");
    expect(out.tripStatus).toBe(TripStatus.PENDING_SUPERVISOR_APPROVAL);
    expect(out.deviation?.status).toBe(TripDeviationStatus.PENDING);
    expect(out.gate.violations.some((v) => v.code === "OUT_OF_GEOFENCE")).toBe(
      true,
    );
  });

  it("fuera de ventana horaria también exige aprobación", () => {
    const out = decideStartOutcome({
      gps: { lat: 4.7011, lng: -74.146 },
      origin,
      departAt,
      serverNow: new Date("2026-08-06T18:00:00.000Z"),
    });
    expect(out.status).toBe("PENDIENTE_APROBACION_SUPERVISOR");
    expect(
      out.gate.violations.some((v) => v.code === "OUT_OF_TIME_WINDOW"),
    ).toBe(true);
  });

  it("dentro de tolerancia inicia de inmediato (INICIADO)", () => {
    const out = decideStartOutcome({
      gps: { lat: 4.70105, lng: -74.14602 },
      origin,
      departAt,
      serverNow: new Date("2026-08-06T15:10:00.000Z"),
    });
    expect(out.status).toBe("INICIADO");
    expect(out.tripStatus).toBe(TripStatus.IN_TRANSIT);
    expect(out.deviation).toBeNull();
  });
});

describe("aprobación supervisor destraba tracking", () => {
  it("ACEPTAR en START → IN_TRANSIT y trackingStarted", () => {
    const result = applySupervisorDecision(
      {
        action: TripDeviationAction.START,
        previousStatus: TripStatus.ASSIGNED,
      },
      "ACEPTAR",
    );
    expect(result.tripStatus).toBe(TripStatus.IN_TRANSIT);
    expect(result.trackingStarted).toBe(true);
    expect(result.deviationStatus).toBe(TripDeviationStatus.APPROVED);
  });

  it("CANCELAR restaura previousStatus y no inicia tracking", () => {
    const result = applySupervisorDecision(
      {
        action: TripDeviationAction.START,
        previousStatus: TripStatus.ASSIGNED,
      },
      "CANCELAR",
    );
    expect(result.tripStatus).toBe(TripStatus.ASSIGNED);
    expect(result.trackingStarted).toBe(false);
    expect(result.deviationStatus).toBe(TripDeviationStatus.REJECTED);
  });

  it("ACEPTAR en END → COMPLETED", () => {
    const result = applySupervisorDecision(
      {
        action: TripDeviationAction.END,
        previousStatus: TripStatus.IN_TRANSIT,
      },
      "ACEPTAR",
    );
    expect(result.tripStatus).toBe(TripStatus.COMPLETED);
  });
});
