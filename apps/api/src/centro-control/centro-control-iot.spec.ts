import { canTransmitEngineShutdown } from "./dto/centro-control.dto";

describe("canTransmitEngineShutdown — gate IoT SOS", () => {
  it("permite transmisión solo con SOS ACTIVE + autorización + confirmProtocol", () => {
    expect(
      canTransmitEngineShutdown({
        sosStatus: "ACTIVE",
        engineShutdownAuthorized: true,
        confirmProtocol: true,
      }),
    ).toEqual({ ok: true });
  });

  it("bloquea si SOS no está activo", () => {
    const r = canTransmitEngineShutdown({
      sosStatus: "CLOSED",
      engineShutdownAuthorized: true,
      confirmProtocol: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/SOS/i);
  });

  it("bloquea sin autorización en checklist", () => {
    const r = canTransmitEngineShutdown({
      sosStatus: "ACTIVE",
      engineShutdownAuthorized: false,
      confirmProtocol: true,
    });
    expect(r.ok).toBe(false);
  });

  it("bloquea sin confirmación explícita de protocolo", () => {
    const r = canTransmitEngineShutdown({
      sosStatus: "ACTIVE",
      engineShutdownAuthorized: true,
      confirmProtocol: false,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Confirmación/i);
  });
});
