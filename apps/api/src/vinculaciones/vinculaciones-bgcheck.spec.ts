import { diagnoseBackgroundRisk } from "./dto/vinculaciones.dto";

describe("diagnoseBackgroundRisk — SIMIT + RUNT", () => {
  it("GREEN sin multas y licencia válida", () => {
    const r = diagnoseBackgroundRisk({
      simitFinesCount: 0,
      simitTotalCop: 0,
      runtLicenseValid: true,
      runtLicenseExpiresAt: new Date(Date.now() + 86400000 * 200),
    });
    expect(r.riskLight).toBe("GREEN");
  });

  it("RED con licencia vencida", () => {
    const r = diagnoseBackgroundRisk({
      simitFinesCount: 0,
      simitTotalCop: 0,
      runtLicenseValid: false,
    });
    expect(r.riskLight).toBe("RED");
  });

  it("AMBER con multas moderadas", () => {
    const r = diagnoseBackgroundRisk({
      simitFinesCount: 2,
      simitTotalCop: 800_000,
      runtLicenseValid: true,
      runtLicenseExpiresAt: new Date(Date.now() + 86400000 * 100),
    });
    expect(r.riskLight).toBe("AMBER");
  });
});
