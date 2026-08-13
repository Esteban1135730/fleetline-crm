import { CampoService } from "./campo.service";

describe("CampoService.syncOfflineBoardings", () => {
  it("persiste abordajes offline y marca SYNCED omitiendo duplicados", async () => {
    const created: string[] = [];
    const prisma = {
      fieldBoardingOverride: {
        findMany: jest.fn().mockResolvedValue([{ clientEventId: "dup-1" }]),
        findUnique: jest.fn().mockImplementation(({ where }) => {
          const id = where.organizationId_clientEventId.clientEventId;
          if (id === "dup-1") {
            return Promise.resolve({
              id: "existing",
              clientEventId: "dup-1",
              syncStatus: "SYNCED",
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn().mockImplementation(({ data }) => {
          created.push(data.clientEventId);
          return Promise.resolve({
            id: `b-${data.clientEventId}`,
            ...data,
            syncStatus: "SYNCED",
          });
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      trip: {
        findFirst: jest.fn().mockResolvedValue({
          id: "trip-1",
          organizationId: "org-1",
        }),
      },
      passengerProfile: { findFirst: jest.fn().mockResolvedValue(null) },
      boardingPass: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new CampoService(prisma as never, kafka as never);

    const result = await svc.syncOfflineBoardings("org-1", "user-carlos", {
      events: [
        {
          clientEventId: "dup-1",
          tripId: "trip-1",
          passengerDocument: "1001",
          capturedAt: new Date("2026-08-12T09:00:00.000Z"),
        },
        {
          clientEventId: "new-2",
          tripId: "trip-1",
          passengerName: "Ana Pérez",
          capturedAt: new Date("2026-08-12T09:05:00.000Z"),
        },
      ],
    });

    expect(result.syncedCount).toBe(1);
    expect(result.skippedDuplicates).toContain("dup-1");
    expect(created).toEqual(["new-2"]);
    expect(kafka.emit).toHaveBeenCalledWith(
      "campo.abordaje.manual",
      expect.objectContaining({ tripId: "trip-1" }),
    );
  });
});
