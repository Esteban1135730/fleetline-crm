/** Sugerencia de relevos — tests unitarios */

export function filterAvailableDrivers(
  drivers: Array<{
    id: string;
    fatigueScore: number;
    dispatchBlocked: boolean;
  }>,
  busyIds: Set<string>,
  noveltyIds: Set<string>,
  excludeId: string,
  fatigueWarnAt = 60,
) {
  return drivers
    .filter(
      (d) =>
        d.id !== excludeId &&
        !d.dispatchBlocked &&
        !busyIds.has(d.id) &&
        !noveltyIds.has(d.id),
    )
    .map((d) => ({
      ...d,
      fatigueWarning: d.fatigueScore >= fatigueWarnAt,
    }))
    .sort((a, b) => a.fatigueScore - b.fatigueScore);
}

describe("relevos por incapacidad", () => {
  it("sugiere conductores libres y marca warning PESV por fatiga", () => {
    const drivers = [
      { id: "a", fatigueScore: 10, dispatchBlocked: false },
      { id: "b", fatigueScore: 70, dispatchBlocked: false },
      { id: "c", fatigueScore: 5, dispatchBlocked: true },
      { id: "d", fatigueScore: 20, dispatchBlocked: false },
    ];
    const busy = new Set(["d"]);
    const novelty = new Set<string>();
    const list = filterAvailableDrivers(drivers, busy, novelty, "x", 60);
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
    expect(list.find((x) => x.id === "b")?.fatigueWarning).toBe(true);
    expect(list.find((x) => x.id === "a")?.fatigueWarning).toBe(false);
  });

  it("excluye al conductor con novedad (incapacidad)", () => {
    const drivers = [
      { id: "sick", fatigueScore: 0, dispatchBlocked: false },
      { id: "ok", fatigueScore: 15, dispatchBlocked: false },
    ];
    const list = filterAvailableDrivers(
      drivers,
      new Set(),
      new Set(["sick"]),
      "sick",
      60,
    );
    expect(list.map((x) => x.id)).toEqual(["ok"]);
  });
});
