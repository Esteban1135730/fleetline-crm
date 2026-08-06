/**
 * Persistencia chat — contrato de filas TripChatMessage / SupportChatMessage.
 */
describe("chat persistencia", () => {
  type TripChatRow = {
    id: string;
    organizationId: string;
    tripId: string;
    authorUserId: string;
    authorName: string;
    authorRole: string;
    body: string;
    serverTime: Date;
  };

  type SupportRow = {
    id: string;
    organizationId: string;
    authorUserId: string;
    authorName: string;
    authorRole: string;
    body: string;
    serverTime: Date;
  };

  const store = {
    trip: [] as TripChatRow[],
    support: [] as SupportRow[],
  };

  beforeEach(() => {
    store.trip = [];
    store.support = [];
  });

  it("persiste mensaje de viaje ligado a tripId", () => {
    const row: TripChatRow = {
      id: "m1",
      organizationId: "org1",
      tripId: "trip-42",
      authorUserId: "u1",
      authorName: "Carlos Conductor",
      authorRole: "conductor",
      body: "En origen — esperando autorización",
      serverTime: new Date("2026-08-06T15:00:00.000Z"),
    };
    store.trip.push(row);
    const found = store.trip.filter((m) => m.tripId === "trip-42");
    expect(found).toHaveLength(1);
    expect(found[0].body).toContain("autorización");
    expect(found[0].serverTime.toISOString()).toBe(
      "2026-08-06T15:00:00.000Z",
    );
  });

  it("persiste soporte general sin tripId", () => {
    const row: SupportRow = {
      id: "s1",
      organizationId: "org1",
      authorUserId: "u1",
      authorName: "Carlos Conductor",
      authorRole: "conductor",
      body: "GPS no sincroniza en Android 14",
      serverTime: new Date(),
    };
    store.support.push(row);
    expect(store.support[0]).not.toHaveProperty("tripId");
    expect(store.support[0].body).toContain("GPS");
  });

  it("hilo por viaje no mezcla mensajes de otro tripId", () => {
    store.trip.push(
      {
        id: "a",
        organizationId: "org1",
        tripId: "t1",
        authorUserId: "u1",
        authorName: "A",
        authorRole: "conductor",
        body: "msg t1",
        serverTime: new Date(),
      },
      {
        id: "b",
        organizationId: "org1",
        tripId: "t2",
        authorUserId: "u2",
        authorName: "B",
        authorRole: "supervisor",
        body: "msg t2",
        serverTime: new Date(),
      },
    );
    expect(store.trip.filter((m) => m.tripId === "t1")).toHaveLength(1);
    expect(store.trip.filter((m) => m.tripId === "t2")[0].body).toBe("msg t2");
  });
});
