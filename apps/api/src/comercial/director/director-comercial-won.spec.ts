import { SalesPipelineStage } from "@fsg/db";
import { DirectorComercialService } from "./director-comercial.service";

describe("DirectorComercialService.markDealWon — Centro de Costos", () => {
  it("crea automáticamente CostCenter en Contabilidad al marcar Ganado", async () => {
    const costCenter = {
      id: "cc-1",
      code: "CC-B2B-2026-0001",
      plate: "B2B-B2B-2026-0001",
      name: "CC · Colegio Andes",
      organizationId: "org-1",
    };

    const prisma = {
      commercialDeal: {
        findFirst: jest.fn().mockResolvedValue({
          id: "deal-1",
          code: "B2B-2026-0001",
          accountName: "Colegio Andes",
          costCenterId: null,
          organizationId: "org-1",
        }),
        update: jest.fn().mockResolvedValue({
          id: "deal-1",
          stage: SalesPipelineStage.CERRADO_GANADO,
          costCenterId: costCenter.id,
          costCenter,
        }),
      },
      costCenter: {
        create: jest.fn().mockResolvedValue(costCenter),
      },
      transportContract: {
        update: jest.fn().mockResolvedValue({
          id: "ctr-1",
          status: "ACTIVE",
          costCenterId: costCenter.id,
          signedAt: new Date(),
        }),
      },
      docuSignEnvelope: {
        update: jest.fn().mockResolvedValue({
          id: "env-1",
          status: "SIGNED",
        }),
      },
      capacityPlanningRequest: {
        create: jest.fn().mockResolvedValue({
          id: "cap-1",
          status: "PENDING",
        }),
      },
      recurringBillingSchedule: {
        create: jest.fn().mockResolvedValue({
          id: "bill-1",
          active: true,
        }),
      },
    };

    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new DirectorComercialService(prisma as never, kafka as never);

    const result = await svc.markDealWon({
      organizationId: "org-1",
      dealId: "deal-1",
      contractId: "ctr-1",
      envelopeId: "env-1",
      provider: "DOCUSIGN_MOCK",
      vehiclesRequired: 3,
      routeLabel: "Bogotá Norte",
      monthlyValue: 28_000_000,
      customerId: "cust-1",
    });

    expect(prisma.costCenter.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          code: "CC-B2B-2026-0001",
          name: "CC · Colegio Andes",
          active: true,
        }),
      }),
    );
    expect(result.costCenter.id).toBe("cc-1");
    expect(prisma.commercialDeal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: SalesPipelineStage.CERRADO_GANADO,
          costCenterId: "cc-1",
        }),
      }),
    );
    expect(prisma.capacityPlanningRequest.create).toHaveBeenCalled();
    expect(prisma.recurringBillingSchedule.create).toHaveBeenCalled();
    expect(kafka.emit).toHaveBeenCalledWith(
      "comercial.deal.won",
      expect.objectContaining({
        costCenterId: "cc-1",
        dealId: "deal-1",
      }),
    );
  });

  it("no duplica Centro de Costos si el deal ya tiene uno", async () => {
    const prisma = {
      commercialDeal: {
        findFirst: jest.fn().mockResolvedValue({
          id: "deal-1",
          code: "B2B-2026-0001",
          accountName: "Colegio Andes",
          costCenterId: "cc-existing",
          organizationId: "org-1",
        }),
      },
      costCenter: { create: jest.fn() },
    };
    const kafka = { emit: jest.fn() };
    const svc = new DirectorComercialService(prisma as never, kafka as never);

    await expect(
      svc.markDealWon({
        organizationId: "org-1",
        dealId: "deal-1",
        contractId: "ctr-1",
        vehiclesRequired: 1,
        routeLabel: "Ruta",
        monthlyValue: 1,
        customerId: "c1",
      }),
    ).rejects.toThrow(/Centro de Costos ya existe/);

    expect(prisma.costCenter.create).not.toHaveBeenCalled();
  });
});
