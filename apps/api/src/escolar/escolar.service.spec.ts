import {
  SchoolBoardingKind,
  SchoolRouteDirection,
  StudentTripStatus,
} from "@fsg/db";
import {
  kafkaTopicForBoarding,
  parentNotificationCopy,
  resolveStudentStatusAfterBoarding,
} from "./escolar.calc";
import { SchoolRouteService } from "./school-route.service";
import { ParentsTrackingService } from "./parents-tracking.service";

describe("resolveStudentStatusAfterBoarding", () => {
  it("BOARD → ABORDADO", () => {
    expect(
      resolveStudentStatusAfterBoarding({
        kind: SchoolBoardingKind.BOARD,
        direction: SchoolRouteDirection.TO_SCHOOL,
      }),
    ).toBe(StudentTripStatus.ABORDADO);
  });

  it("ALIGHT TO_SCHOOL → ENTREGADO_EN_COLEGIO", () => {
    expect(
      resolveStudentStatusAfterBoarding({
        kind: SchoolBoardingKind.ALIGHT,
        direction: SchoolRouteDirection.TO_SCHOOL,
      }),
    ).toBe(StudentTripStatus.ENTREGADO_EN_COLEGIO);
  });

  it("ALIGHT TO_HOME → ENTREGADO_EN_CASA", () => {
    expect(
      resolveStudentStatusAfterBoarding({
        kind: "ALIGHT",
        direction: "TO_HOME",
      }),
    ).toBe(StudentTripStatus.ENTREGADO_EN_CASA);
  });

  it("ABSENT → AUSENTE", () => {
    expect(
      resolveStudentStatusAfterBoarding({
        kind: "ABSENT",
        direction: "TO_SCHOOL",
      }),
    ).toBe(StudentTripStatus.AUSENTE);
  });
});

describe("kafkaTopicForBoarding", () => {
  it("mapea BOARD/ALIGHT a topics Kafka", () => {
    expect(kafkaTopicForBoarding("BOARD")).toBe("student.boarded");
    expect(kafkaTopicForBoarding("ALIGHT")).toBe("student.alighted");
    expect(kafkaTopicForBoarding("ABSENT")).toBe("student.absent");
  });
});

describe("SchoolRouteService — check-in cambia estado", () => {
  function mockPrisma(overrides: Record<string, unknown>) {
    const eventCreate = jest.fn().mockResolvedValue({
      id: "evt-1",
      createdAt: new Date("2026-07-31T12:00:00.000Z"),
    });
    const studentUpdate = jest.fn();
    const base = {
      schoolRoute: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      schoolStudent: {
        findFirst: jest.fn(),
        update: studentUpdate,
      },
      schoolStudentAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: "asg-1" }),
      },
      schoolRouteRun: {
        findFirst: jest.fn().mockResolvedValue({ id: "run-1" }),
      },
      schoolBoardingEvent: { create: eventCreate },
      $transaction: jest.fn(async (ops: Array<Promise<unknown>>) =>
        Promise.all(ops),
      ),
      ...overrides,
    };
    return { prisma: base, eventCreate, studentUpdate };
  }

  it("QR BOARD actualiza estudiante a ABORDADO y emite student.boarded", async () => {
    const { prisma, eventCreate, studentUpdate } = mockPrisma({});
    studentUpdate.mockResolvedValue({
      id: "stu-1",
      name: "María Gómez",
      currentStatus: StudentTripStatus.ABORDADO,
    });
    (prisma.schoolRoute.findFirst as jest.Mock).mockResolvedValue({
      id: "route-1",
      direction: SchoolRouteDirection.TO_SCHOOL,
      code: "ESC-01",
    });
    (prisma.schoolStudent.findFirst as jest.Mock).mockResolvedValue({
      id: "stu-1",
      name: "María Gómez",
      familyId: "fam-1",
      currentStatus: StudentTripStatus.BUS_EN_CAMINO,
      qrCode: "QR-MARIA",
    });
    (prisma.schoolStudentAssignment.findFirst as jest.Mock).mockResolvedValue({
      id: "asg-1",
      studentId: "stu-1",
      schoolRouteId: "route-1",
    });

    const emit = jest.fn().mockResolvedValue(undefined);
    const svc = new SchoolRouteService(prisma as never, { emit } as never);

    const out = await svc.boardingCheckIn("org-1", {
      qrCode: "QR-MARIA",
      routeId: "route-1",
      kind: "BOARD",
      method: "QR",
      lat: 4.71,
      lng: -74.07,
    });

    expect(out.student.currentStatus).toBe(StudentTripStatus.ABORDADO);
    expect(out.topic).toBe("student.boarded");
    expect(eventCreate).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      "student.boarded",
      expect.objectContaining({
        studentId: "stu-1",
        status: StudentTripStatus.ABORDADO,
        lat: 4.71,
        lng: -74.07,
      }),
    );
  });

  it("ALIGHT en ruta a casa → ENTREGADO_EN_CASA", async () => {
    const { prisma, studentUpdate } = mockPrisma({});
    studentUpdate.mockResolvedValue({
      id: "stu-1",
      currentStatus: StudentTripStatus.ENTREGADO_EN_CASA,
    });
    (prisma.schoolRoute.findFirst as jest.Mock).mockResolvedValue({
      id: "route-2",
      direction: SchoolRouteDirection.TO_HOME,
      code: "ESC-02",
    });
    (prisma.schoolStudent.findFirst as jest.Mock).mockResolvedValue({
      id: "stu-1",
      name: "María",
      familyId: "fam-1",
      currentStatus: StudentTripStatus.ABORDADO,
    });
    (prisma.schoolRouteRun.findFirst as jest.Mock).mockResolvedValue(null);

    const emit = jest.fn().mockResolvedValue(undefined);
    const svc = new SchoolRouteService(prisma as never, { emit } as never);

    const out = await svc.boardingCheckIn("org-1", {
      studentId: "stu-1",
      routeId: "route-2",
      kind: "ALIGHT",
    });

    expect(out.student.currentStatus).toBe(
      StudentTripStatus.ENTREGADO_EN_CASA,
    );
    expect(out.topic).toBe("student.alighted");
  });
});

describe("ParentsTrackingService — estado y ubicación", () => {
  it("studentStatus entrega estado y ubicación de ruta", async () => {
    const prisma = {
      schoolStudent: {
        findFirst: jest.fn().mockResolvedValue({
          id: "stu-1",
          name: "María Gómez",
          currentStatus: StudentTripStatus.ABORDADO,
          schoolName: "Colegio Norte",
          grade: "5A",
          assignments: [
            {
              schoolRoute: {
                id: "route-1",
                code: "ESC-01",
                name: "Ruta Norte",
                direction: "TO_SCHOOL",
                lastLat: 4.711,
                lastLng: -74.072,
                lastLocatedAt: new Date("2026-07-31T12:05:00.000Z"),
                vehicle: { id: "v1", plate: "BOG-892", lat: 4.71, lng: -74.07 },
              },
              stop: { name: "Parada 3" },
            },
          ],
          boardingEvents: [],
        }),
      },
      parentNotification: { create: jest.fn() },
    };
    const gateway = {
      emitToOrg: jest.fn(),
      emitToFamily: jest.fn(),
    };
    const svc = new ParentsTrackingService(prisma as never, gateway as never);
    const status = await svc.studentStatus("org-1", "stu-1");

    expect(status.status).toBe(StudentTripStatus.ABORDADO);
    expect(status.route?.location.lat).toBe(4.711);
    expect(status.route?.location.plate).toBe("BOG-892");
  });

  it("busLocation expone telemetría del bus", async () => {
    const prisma = {
      schoolRoute: {
        findFirst: jest.fn().mockResolvedValue({
          id: "route-1",
          code: "ESC-01",
          name: "Ruta Norte",
          direction: "TO_SCHOOL",
          lastLat: 4.72,
          lastLng: -74.06,
          lastLocatedAt: new Date("2026-07-31T12:10:00.000Z"),
          vehicle: {
            id: "v1",
            plate: "BOG-892",
            lat: 4.72,
            lng: -74.06,
            status: "IN_SERVICE",
            updatedAt: new Date(),
          },
          runs: [{ id: "run-1", status: "IN_PROGRESS" }],
          assignments: [
            {
              student: {
                id: "stu-1",
                name: "María",
                currentStatus: StudentTripStatus.ABORDADO,
              },
            },
          ],
        }),
      },
    };
    const svc = new ParentsTrackingService(
      prisma as never,
      { emitToOrg: jest.fn(), emitToFamily: jest.fn() } as never,
    );
    const loc = await svc.busLocation("org-1", "route-1");
    expect(loc.location.lat).toBe(4.72);
    expect(loc.vehicle?.plate).toBe("BOG-892");
    expect(loc.students[0].currentStatus).toBe(StudentTripStatus.ABORDADO);
  });

  it("notifyGuardians crea notificación y emite WS", async () => {
    const create = jest.fn().mockResolvedValue({ id: "n-1" });
    const prisma = { parentNotification: { create } };
    const gateway = {
      emitToOrg: jest.fn(),
      emitToFamily: jest.fn(),
    };
    const svc = new ParentsTrackingService(prisma as never, gateway as never);
    await svc.notifyGuardians({
      organizationId: "org-1",
      studentId: "stu-1",
      studentName: "María",
      familyId: "fam-1",
      routeId: "route-1",
      kind: "BOARD",
      status: "ABORDADO",
      at: new Date().toISOString(),
      eventId: "evt-1",
    });
    expect(create).toHaveBeenCalled();
    expect(gateway.emitToFamily).toHaveBeenCalledWith(
      "fam-1",
      "parent.student.update",
      expect.objectContaining({ status: "ABORDADO" }),
    );
    expect(parentNotificationCopy({
      studentName: "María",
      kind: "BOARD",
      status: "ABORDADO",
    }).title).toMatch(/abordó/);
  });
});
