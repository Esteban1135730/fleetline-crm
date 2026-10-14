import { rankDispatch } from "./dispatch-score";

describe("rankDispatch", () => {
  const restedNear = {
    driverId: "d1",
    driverName: "Ana",
    vehicleId: "v1",
    plate: "AAA111",
    fatigueOk: true,
    papersOk: true,
    distanceM: 800,
  };
  const restedFar = {
    driverId: "d2",
    driverName: "Bruno",
    vehicleId: "v2",
    plate: "BBB222",
    fatigueOk: true,
    papersOk: true,
    distanceM: 12_000,
  };
  const fatiguedClose = {
    driverId: "d3",
    driverName: "Carla",
    vehicleId: "v3",
    plate: "CCC333",
    fatigueOk: false,
    papersOk: true,
    distanceM: 400,
  };
  const expiredSoat = {
    driverId: "d4",
    driverName: "Diego",
    vehicleId: "v4",
    plate: "DDD444",
    fatigueOk: true,
    papersOk: false,
    distanceM: 200,
  };

  it("ordena por puntaje entre quienes cumplen fatiga y papeles", () => {
    const ranked = rankDispatch([restedFar, restedNear]);
    expect(ranked[0].driverId).toBe("d1");
    expect(ranked[0].score).toBe(50 + 30 + 20);
    expect(ranked[1].driverId).toBe("d2");
    expect(ranked[1].score).toBe(30 + 20);
  });

  it("un conductor fatigado o con SOAT vencido no queda primero", () => {
    const ranked = rankDispatch([fatiguedClose, expiredSoat, restedFar]);
    expect(ranked[0].driverId).toBe("d2");
    expect(ranked[0].qualified).toBe(true);
    expect(ranked.slice(1).every((row) => !row.qualified)).toBe(true);
  });

  it("sin GPS sigue sugiriendo por fatiga y papeles e indica cercanía en 0", () => {
    const ranked = rankDispatch([
      { ...restedNear, distanceM: null },
      { ...restedFar, distanceM: null, driverName: "Zoe", driverId: "d9" },
    ]);
    expect(ranked[0].reasons[0]).toMatch(/Sin posición GPS/);
    expect(ranked[0].score).toBe(30 + 20);
    expect(ranked).toHaveLength(2);
  });

  it("devuelve como máximo tres", () => {
    const many = [restedNear, restedFar, fatiguedClose, expiredSoat];
    expect(rankDispatch(many)).toHaveLength(3);
  });
});
