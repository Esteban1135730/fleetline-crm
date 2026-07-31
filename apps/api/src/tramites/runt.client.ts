import { Injectable, Logger } from "@nestjs/common";
import { ComplianceDocType } from "@fsg/db";

export type RuntDocLookup = {
  type: ComplianceDocType;
  reference: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  validInGovDb: boolean;
  raw: Record<string, unknown>;
};

export type RuntVehicleReport = {
  plate: string;
  vin?: string;
  documents: RuntDocLookup[];
  queriedAt: string;
  source: "RUNT_MOCK" | "RUNT_API";
};

export type RuntLicenseReport = {
  document: string;
  licenseNumber: string | null;
  category: string | null;
  expiresAt: Date | null;
  validInGovDb: boolean;
  raw: Record<string, unknown>;
  queriedAt: string;
  source: "RUNT_MOCK" | "RUNT_API";
};

/**
 * Cliente RUNT / Ministerios.
 * Por defecto usa mock determinista; si `RUNT_API_URL` está definido, intenta HTTP real.
 */
@Injectable()
export class RuntClient {
  private readonly logger = new Logger(RuntClient.name);

  async lookupVehicleByPlate(plate: string): Promise<RuntVehicleReport> {
    const normalized = plate.trim().toUpperCase();
    const apiUrl = process.env.RUNT_API_URL?.trim();

    if (apiUrl) {
      try {
        const res = await fetch(
          `${apiUrl.replace(/\/$/, "")}/vehicles/${encodeURIComponent(normalized)}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.RUNT_API_TOKEN || ""}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (res.ok) {
          const json = (await res.json()) as RuntVehicleReport;
          return { ...json, source: "RUNT_API" };
        }
        this.logger.warn(
          `RUNT API ${res.status} para ${normalized} — fallback mock`,
        );
      } catch (err) {
        this.logger.warn(
          `RUNT API error (${(err as Error).message}) — fallback mock`,
        );
      }
    }

    return this.mockVehicle(normalized);
  }

  async lookupLicenseByDocument(document: string): Promise<RuntLicenseReport> {
    const doc = document.trim();
    const apiUrl = process.env.RUNT_API_URL?.trim();

    if (apiUrl) {
      try {
        const res = await fetch(
          `${apiUrl.replace(/\/$/, "")}/licenses/${encodeURIComponent(doc)}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.RUNT_API_TOKEN || ""}`,
              Accept: "application/json",
            },
            signal: AbortSignal.timeout(8000),
          },
        );
        if (res.ok) {
          const json = (await res.json()) as RuntLicenseReport;
          return { ...json, source: "RUNT_API" };
        }
      } catch (err) {
        this.logger.warn(
          `RUNT license API error (${(err as Error).message}) — fallback mock`,
        );
      }
    }

    return this.mockLicense(doc);
  }

  /**
   * Mock determinista:
   * - Placas *002 / *BLOQ / con SOAT vencido forzado vía env RUNT_MOCK_EXPIRED_PLATES
   * - Resto: SOAT + Tecnomecánica vigentes ~8 y ~6 meses
   */
  private mockVehicle(plate: string): RuntVehicleReport {
    const expiredList = (process.env.RUNT_MOCK_EXPIRED_PLATES || "BUS-002")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const forceExpired =
      expiredList.includes(plate) ||
      plate.endsWith("002") ||
      plate.includes("BLOQ");

    const now = Date.now();
    const soatExp = forceExpired
      ? new Date(now - 30 * 86400000)
      : new Date(now + 240 * 86400000);
    const tecnoExp = forceExpired
      ? new Date(now + 90 * 86400000)
      : new Date(now + 180 * 86400000);

    return {
      plate,
      source: "RUNT_MOCK",
      queriedAt: new Date().toISOString(),
      documents: [
        {
          type: ComplianceDocType.SOAT,
          reference: `RUNT-SOAT-${plate}`,
          issuedAt: new Date(soatExp.getTime() - 365 * 86400000),
          expiresAt: soatExp,
          validInGovDb: !forceExpired,
          raw: { mock: true, forceExpired, policy: "SOAT" },
        },
        {
          type: ComplianceDocType.TECNOMECANICA,
          reference: `RUNT-TM-${plate}`,
          issuedAt: new Date(tecnoExp.getTime() - 365 * 86400000),
          expiresAt: tecnoExp,
          validInGovDb: true,
          raw: { mock: true, policy: "TECNOMECANICA" },
        },
        {
          type: ComplianceDocType.TARJETA_OPERACION,
          reference: `RUNT-TO-${plate}`,
          issuedAt: new Date(now - 200 * 86400000),
          expiresAt: forceExpired
            ? new Date(now - 5 * 86400000)
            : new Date(now + 400 * 86400000),
          validInGovDb: !forceExpired,
          raw: { mock: true, policy: "TARJETA_OPERACION" },
        },
      ],
    };
  }

  private mockLicense(document: string): RuntLicenseReport {
    const forceExpired = document.endsWith("9") || document.includes("VENC");
    const expiresAt = forceExpired
      ? new Date(Date.now() - 10 * 86400000)
      : new Date(Date.now() + 500 * 86400000);

    return {
      document,
      licenseNumber: `LIC-${document.slice(-6) || "000000"}`,
      category: "C2",
      expiresAt,
      validInGovDb: !forceExpired,
      raw: { mock: true, forceExpired },
      queriedAt: new Date().toISOString(),
      source: "RUNT_MOCK",
    };
  }
}
