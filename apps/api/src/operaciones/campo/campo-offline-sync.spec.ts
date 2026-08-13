import { mergeOfflineBoardingQueue } from "./dto/campo.dto";

describe("mergeOfflineBoardingQueue — sync diferida", () => {
  it("inserta eventos nuevos y omite duplicados ya sincronizados", () => {
    const result = mergeOfflineBoardingQueue({
      pending: [
        {
          clientEventId: "evt-1",
          tripId: "trip-a",
          capturedAt: new Date("2026-08-12T10:00:00.000Z"),
        },
        {
          clientEventId: "evt-2",
          tripId: "trip-a",
          capturedAt: new Date("2026-08-12T10:01:00.000Z"),
        },
        {
          clientEventId: "evt-1",
          tripId: "trip-a",
          capturedAt: new Date("2026-08-12T10:00:00.000Z"),
        },
      ],
      alreadySyncedIds: new Set(["evt-1"]),
    });

    expect(result.skippedDuplicates).toEqual(["evt-1", "evt-1"]);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toInsert[0].clientEventId).toBe("evt-2");
    expect(result.syncedCount).toBe(1);
  });

  it("sincroniza toda la cola si no hay previos", () => {
    const result = mergeOfflineBoardingQueue({
      pending: [
        {
          clientEventId: "a",
          tripId: "t1",
          capturedAt: new Date(),
        },
        {
          clientEventId: "b",
          tripId: "t1",
          capturedAt: new Date(),
        },
      ],
      alreadySyncedIds: new Set(),
    });
    expect(result.syncedCount).toBe(2);
    expect(result.skippedDuplicates).toEqual([]);
  });
});
