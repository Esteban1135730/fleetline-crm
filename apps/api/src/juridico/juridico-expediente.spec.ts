import { createHash } from "crypto";
import { isPathDeniedForRole, hasPermission } from "@fsg/shared";
import { JuridicoService } from "./juridico.service";

describe("RBAC DIRECTOR_JURIDICO", () => {
  it("deniega Tesorería y Contabilidad (HTTP 403 path)", () => {
    expect(isPathDeniedForRole("director_juridico", "/tesoreria")).toBe(true);
    expect(isPathDeniedForRole("director_juridico", "/api/v1/tesoreria")).toBe(
      true,
    );
    expect(isPathDeniedForRole("director_juridico", "/contabilidad")).toBe(
      true,
    );
    expect(
      isPathDeniedForRole("director_juridico", "/api/v1/contabilidad"),
    ).toBe(true);
    expect(isPathDeniedForRole("director_juridico", "/finanzas")).toBe(true);
  });

  it("permite Legal Hub y lectura forense Ops/Taller/RRHH", () => {
    expect(
      isPathDeniedForRole("director_juridico", "/juridico/dashboard"),
    ).toBe(false);
    expect(hasPermission("director_juridico", "legal_contracts", "DELETE")).toBe(
      true,
    );
    expect(hasPermission("director_juridico", "legal_litigation", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("director_juridico", "legal_sarlaft", "UPDATE")).toBe(
      true,
    );
    expect(hasPermission("director_juridico", "legal_evidence", "CREATE")).toBe(
      true,
    );
    expect(hasPermission("director_juridico", "logistica_despacho", "READ")).toBe(
      true,
    );
    expect(hasPermission("director_juridico", "taller", "READ")).toBe(true);
    expect(hasPermission("director_juridico", "rrhh", "READ")).toBe(true);
    expect(hasPermission("director_juridico", "finanzas", "READ")).toBe(false);
    expect(hasPermission("director_juridico", "contabilidad", "READ")).toBe(
      false,
    );
    expect(
      hasPermission("director_juridico", "tesoreria_dispersion", "READ"),
    ).toBe(false);
  });
});

describe("Expediente Probatorio PDF inmutable", () => {
  const service = new JuridicoService(
    {} as never,
    { screen: async () => ({ document: "", hits: [], riskScore: 0, matched: false }) } as never,
  );

  it("genera PDF con preoperacional, GPS y hash SHA-256 estable", async () => {
    const sections = {
      plate: "BOG-892",
      vin: "VINTEST123",
      brand: "Mercedes",
      model: "Sprinter",
      generatedAt: "2026-07-30T12:00:00.000Z",
      preoperacionales: [
        {
          tripCode: "TRP-001",
          signedAt: "2026-07-29T06:00:00.000Z",
          approved: true,
          brakesOk: true,
          lightsOk: true,
          tiresOk: true,
          kitOk: true,
          oilOk: true,
          observations: "Nominal",
          driverName: "Carlos Conductor",
        },
      ],
      tallerBitacora: [
        {
          code: "OT-100",
          description: "Cambio pastillas",
          status: "CLOSED",
          openedAt: "2026-07-20T10:00:00.000Z",
          closedAt: "2026-07-20T14:00:00.000Z",
          odometerAtOpen: 120000,
        },
      ],
      telemetriaGps: [
        {
          tripCode: "TRP-001",
          lat: 4.711,
          lng: -74.0721,
          speedKph: 42,
          recordedAt: "2026-07-29T08:15:00.000Z",
        },
        {
          tripCode: "TRP-001",
          lat: 4.712,
          lng: -74.073,
          speedKph: 38,
          recordedAt: "2026-07-29T08:16:00.000Z",
        },
      ],
    };

    const contentHash = createHash("sha256")
      .update(JSON.stringify(sections))
      .digest("hex");
    const pdf = await service.renderEvidentiaryPdf(sections, contentHash);

    expect(pdf).toBeInstanceOf(Buffer);
    expect(pdf.length).toBeGreaterThan(800);
    expect(pdf.subarray(0, 4).toString("ascii")).toBe("%PDF");

    /** PDFKit emite texto como hex en el stream — validar payload canónico */
    const hexBlob = pdf.toString("latin1");
    const asHex = (s: string) =>
      Buffer.from(s, "utf8").toString("hex").toUpperCase();
    expect(hexBlob.toUpperCase()).toContain(asHex("BOG-892"));
    expect(hexBlob.toUpperCase()).toContain(asHex("Preoperacionales"));
    expect(hexBlob.toUpperCase()).toContain(asHex("TRP-001"));
    expect(hexBlob.toUpperCase()).toContain(asHex("GPS"));
    expect(hexBlob.toUpperCase()).toContain(asHex(contentHash.slice(0, 16)));

    const hash2 = createHash("sha256")
      .update(JSON.stringify(sections))
      .digest("hex");
    expect(hash2).toBe(contentHash);
    expect(sections.preoperacionales).toHaveLength(1);
    expect(sections.telemetriaGps).toHaveLength(2);
  });

  it("detecta cláusulas de penalidad sobre política FSG", () => {
    const text =
      "Las partes acuerdan una penalidad del 25% del valor del contrato " +
      "por incumplimiento. Multa de 10% aplicable en mora.";
    const flagged = service.extractPenaltyClauses(text, 15);
    expect(flagged.some((f) => f.penaltyPct === 25 && f.severity === "OVER_POLICY")).toBe(
      true,
    );
  });
});
