import {
  HARD_BRAKE_SCORE_PENALTY,
  MIN_SAFETY_SCORE,
  QhseTelemetryService,
  SPEED_SCORE_PENALTY,
} from "./qhse-telemetry.service";

describe("QhseTelemetryService.processRiskEvent", () => {
  function build(safetyScore = 100) {
    const driver = {
      id: "drv-1",
      name: "Carlos",
      document: "1001",
      safetyScore,
      organizationId: "org-1",
    };
    const prisma = {
      driver: {
        findFirst: jest.fn().mockResolvedValue(driver),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: driver.id,
            name: driver.name,
            document: driver.document,
            safetyScore: data.safetyScore,
          }),
        ),
      },
      qualityEvent: {
        create: jest.fn().mockResolvedValue({
          id: "ticket-1",
          kind: "RISK_TICKET",
          title: "Ticket de Riesgo · Exceso",
          status: "OPEN",
        }),
      },
      hqseTrainingRecord: {
        create: jest.fn().mockResolvedValue({
          id: "tr-1",
          topic: "CONDUCCION_DEFENSIVA",
        }),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new QhseTelemetryService(prisma as never, kafka as never);
    return { svc, prisma, kafka, driver };
  }

  it("crea Ticket de Riesgo y baja Driver Score ante exceso de velocidad", async () => {
    const { svc, prisma, kafka } = build(100);
    const result = await svc.processRiskEvent({
      organizationId: "org-1",
      driverId: "drv-1",
      kind: "SPEED_EXCESS",
      speedKmh: 95,
      limitKmh: 80,
      plate: "BOG-892",
    });

    expect(prisma.qualityEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "RISK_TICKET" }),
      }),
    );
    expect(prisma.hqseTrainingRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          topic: "CONDUCCION_DEFENSIVA",
          provider: "APP_CONDUCTOR",
        }),
      }),
    );
    expect(prisma.driver.update).toHaveBeenCalledWith({
      where: { id: "drv-1" },
      data: { safetyScore: 100 - SPEED_SCORE_PENALTY },
      select: expect.any(Object),
    });
    expect(result.driver.safetyScore).toBe(100 - SPEED_SCORE_PENALTY);
    expect(result.scoreDelta).toBe(-SPEED_SCORE_PENALTY);
    expect(kafka.emit).toHaveBeenCalledWith(
      "qhse.risk.ticket.created",
      expect.objectContaining({
        kind: "SPEED_EXCESS",
        safetyScore: 100 - SPEED_SCORE_PENALTY,
      }),
    );
  });

  it("aplica penalización de frenada brusca sin bajar de cero", async () => {
    const { svc, prisma } = build(3);
    const result = await svc.processRiskEvent({
      organizationId: "org-1",
      driverId: "drv-1",
      kind: "HARD_BRAKE",
    });
    expect(result.driver.safetyScore).toBe(MIN_SAFETY_SCORE);
    expect(result.scoreDelta).toBe(-HARD_BRAKE_SCORE_PENALTY);
    expect(prisma.driver.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { safetyScore: MIN_SAFETY_SCORE },
      }),
    );
  });
});
