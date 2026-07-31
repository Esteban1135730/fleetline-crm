import {
  ComplianceDocType,
  DocStatus,
  VehicleStatus,
} from "@fsg/db";
import { RuntSyncService } from "./runt-sync.service";
import type { RuntClient, RuntVehicleReport } from "./runt.client";

describe("RuntSyncService — Kill-Switch al sync", () => {
  const orgId = "org-1";
  const vehicleId = "veh-002";

  function buildPrisma(initialBlocked: boolean) {
    const docsStore: Array<{
      id: string;
      type: ComplianceDocType;
      status: DocStatus;
      expiresAt: Date | null;
      vehicleId: string;
      organizationId: string;
      reference?: string;
      issuedAt?: Date | null;
      runtVerified?: boolean;
      runtPayload?: object;
      notes?: string;
    }> = [];

    let vehicle = {
      id: vehicleId,
      plate: "BUS-002",
      organizationId: orgId,
      complianceBlocked: initialBlocked,
      complianceReason: null as string | null,
      soatActivo: true,
      tecnoActiva: true,
      status: VehicleStatus.AVAILABLE,
      get complianceDocs() {
        return docsStore.filter((d) => d.vehicleId === vehicleId);
      },
    };

    return {
      get vehicle() {
        return vehicle;
      },
      docsStore,
      prisma: {
        vehicle: {
          findUnique: jest.fn(async () => ({
            ...vehicle,
            complianceDocs: [...docsStore],
          })),
          update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(vehicle, data);
            return { ...vehicle };
          }),
        },
        complianceDocument: {
          create: jest.fn(async ({ data }: { data: (typeof docsStore)[0] }) => {
            const row = {
              ...data,
              id: data.id || `doc-${docsStore.length + 1}`,
            };
            docsStore.push(row);
            return row;
          }),
          update: jest.fn(
            async ({
              where,
              data,
            }: {
              where: { id: string };
              data: Partial<(typeof docsStore)[0]>;
            }) => {
              const idx = docsStore.findIndex((d) => d.id === where.id);
              docsStore[idx] = { ...docsStore[idx], ...data };
              return docsStore[idx];
            },
          ),
        },
      },
    };
  }

  it("al sincronizar placa con SOAT vencido, complianceBlocked pasa a true", async () => {
    const { prisma, vehicle } = buildPrisma(false);

    const expired = new Date(Date.now() - 20 * 86400000);
    const future = new Date(Date.now() + 100 * 86400000);

    const report: RuntVehicleReport = {
      plate: "BUS-002",
      source: "RUNT_MOCK",
      queriedAt: new Date().toISOString(),
      documents: [
        {
          type: ComplianceDocType.SOAT,
          reference: "SOAT-X",
          issuedAt: new Date(Date.now() - 400 * 86400000),
          expiresAt: expired,
          validInGovDb: false,
          raw: { mock: true },
        },
        {
          type: ComplianceDocType.TECNOMECANICA,
          reference: "TM-OK",
          issuedAt: new Date(),
          expiresAt: future,
          validInGovDb: true,
          raw: { mock: true },
        },
        {
          type: ComplianceDocType.TARJETA_OPERACION,
          reference: "TO-OK",
          issuedAt: new Date(),
          expiresAt: future,
          validInGovDb: true,
          raw: { mock: true },
        },
      ],
    };

    const runt = {
      lookupVehicleByPlate: jest.fn().mockResolvedValue(report),
    } as unknown as RuntClient;

    const kafka = {
      emitComplianceVehicleBlocked: jest.fn().mockResolvedValue(undefined),
    };

    const service = new RuntSyncService(
      prisma as never,
      runt,
      kafka as never,
    );

    const result = await service.syncVehicleCompliance(vehicleId);

    expect(result.complianceBlocked).toBe(true);
    expect(result.newlyBlocked).toBe(true);
    expect(result.blocks).toContain("SOAT_EXPIRED");
    expect(result.soatActivo).toBe(false);
    expect(vehicle.complianceBlocked).toBe(true);
    expect(vehicle.status).toBe(VehicleStatus.COMPLIANCE_BLOCKED);
    expect(kafka.emitComplianceVehicleBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleId,
        plate: "BUS-002",
        source: "runt_sync",
      }),
    );
  });

  it("placa al día deja complianceBlocked en false", async () => {
    const { prisma, vehicle } = buildPrisma(false);
    vehicle.plate = "BUS-001";
    const future = new Date(Date.now() + 200 * 86400000);

    const report: RuntVehicleReport = {
      plate: "BUS-001",
      source: "RUNT_MOCK",
      queriedAt: new Date().toISOString(),
      documents: [
        {
          type: ComplianceDocType.SOAT,
          reference: "SOAT-OK",
          issuedAt: new Date(),
          expiresAt: future,
          validInGovDb: true,
          raw: {},
        },
        {
          type: ComplianceDocType.TECNOMECANICA,
          reference: "TM-OK",
          issuedAt: new Date(),
          expiresAt: future,
          validInGovDb: true,
          raw: {},
        },
        {
          type: ComplianceDocType.TARJETA_OPERACION,
          reference: "TO-OK",
          issuedAt: new Date(),
          expiresAt: future,
          validInGovDb: true,
          raw: {},
        },
      ],
    };

    const runt = {
      lookupVehicleByPlate: jest.fn().mockResolvedValue(report),
    } as unknown as RuntClient;

    const kafka = {
      emitComplianceVehicleBlocked: jest.fn(),
    };

    const service = new RuntSyncService(
      prisma as never,
      runt,
      kafka as never,
    );

    const result = await service.syncVehicleCompliance(vehicleId);
    expect(result.complianceBlocked).toBe(false);
    expect(result.blocks).toEqual([]);
    expect(result.soatActivo).toBe(true);
    expect(result.tecnoActiva).toBe(true);
    expect(kafka.emitComplianceVehicleBlocked).not.toHaveBeenCalled();
    expect(vehicle.complianceBlocked).toBe(false);
  });
});
