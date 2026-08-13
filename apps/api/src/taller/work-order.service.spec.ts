import { BadRequestException } from "@nestjs/common";
import { VehicleStatus, WorkOrderStatus } from "@fsg/db";
import { WorkOrderService } from "./work-order.service";
import { PartDispatchService } from "./part-dispatch.service";

describe("Taller — OT crítica / antifraude / cierre", () => {
  describe("WorkOrderService", () => {
    it("al abrir OT crítica el vehículo queda bloqueado para despacho", async () => {
      const vehicleUpdate = jest.fn().mockResolvedValue({});
      const kafka = { emit: jest.fn().mockResolvedValue(undefined) };

      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: "veh-1",
            plate: "BUS-001",
            organizationId: "org-1",
            odometerKm: 50000,
            status: VehicleStatus.AVAILABLE,
            complianceBlocked: false,
          }),
          update: vehicleUpdate,
        },
        workOrder: {
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn().mockResolvedValue({
            id: "wo-1",
            code: "OT-0501",
            description: "[CRITICAL] Falla de frenos",
            vehicleId: "veh-1",
            status: WorkOrderStatus.OPEN,
            vehicle: { id: "veh-1", plate: "BUS-001" },
          }),
        },
      };

      const svc = new WorkOrderService(prisma as never, kafka as never);
      const out = await svc.create("org-1", {
        vehicleId: "veh-1",
        description: "Falla de frenos",
        severity: "CRITICAL",
      });

      expect(out.critical).toBe(true);
      expect(out.vehicleBlockedForDispatch).toBe(true);
      expect(vehicleUpdate).toHaveBeenCalledWith({
        where: { id: "veh-1" },
        data: expect.objectContaining({
          status: VehicleStatus.MAINTENANCE,
          complianceBlocked: true,
        }),
      });
      expect(kafka.emit).toHaveBeenCalledWith(
        "taller.vehiculo.bloqueado",
        expect.objectContaining({ vehicleId: "veh-1" }),
      );
    });

    it("al cerrar la OT restaura disponibilidad del vehículo", async () => {
      const vehicleUpdate = jest.fn().mockResolvedValue({});
      const kafka = { emit: jest.fn().mockResolvedValue(undefined) };

      const prisma = {
        workOrder: {
          findFirst: jest.fn().mockResolvedValue({
            id: "wo-1",
            code: "OT-0501",
            description: "[CRITICAL] Falla de frenos",
            vehicleId: "veh-1",
            status: WorkOrderStatus.OPEN,
            vehicle: {
              id: "veh-1",
              plate: "BUS-001",
              complianceReason: "OT crítica OT-0501 — bloqueo despacho Logística",
            },
          }),
          update: jest.fn().mockResolvedValue({
            id: "wo-1",
            status: WorkOrderStatus.DONE,
            qcStatus: "PASSED",
            vehicle: { id: "veh-1", plate: "BUS-001" },
          }),
          count: jest.fn().mockResolvedValue(0),
        },
        vehicle: { update: vehicleUpdate },
        prekitReservation: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      const svc = new WorkOrderService(prisma as never, kafka as never);
      const out = await svc.close("org-1", "wo-1");

      expect(out.vehicleReleased).toBe(true);
      expect(out.logisticsStatus).toBe("VERDE");
      expect(vehicleUpdate).toHaveBeenCalledWith({
        where: { id: "veh-1" },
        data: expect.objectContaining({
          status: VehicleStatus.AVAILABLE,
          complianceBlocked: false,
        }),
      });
      expect(kafka.emit).toHaveBeenCalledWith(
        "taller.vehiculo.reparado",
        expect.objectContaining({ logisticsStatus: "VERDE" }),
      );
    });

    it("liberar-qc pasa vehículo de ROJO (MAINTENANCE) a VERDE (AVAILABLE)", async () => {
      const vehicleUpdate = jest.fn().mockResolvedValue({});
      const kafka = { emit: jest.fn().mockResolvedValue(undefined) };

      const prisma = {
        workOrder: {
          findFirst: jest.fn().mockResolvedValue({
            id: "wo-qc",
            code: "OT-0600",
            description: "Preventivo 10k",
            vehicleId: "veh-2",
            status: WorkOrderStatus.IN_PROGRESS,
            vehicle: {
              id: "veh-2",
              plate: "BUS-002",
              status: VehicleStatus.MAINTENANCE,
              complianceReason: null,
            },
          }),
          update: jest.fn().mockResolvedValue({
            id: "wo-qc",
            status: WorkOrderStatus.DONE,
            qcStatus: "PASSED",
            vehicle: { id: "veh-2", plate: "BUS-002" },
          }),
          count: jest.fn().mockResolvedValue(0),
        },
        vehicle: { update: vehicleUpdate },
        prekitReservation: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const svc = new WorkOrderService(prisma as never, kafka as never);
      const out = await svc.liberarQc(
        "org-1",
        "wo-qc",
        { workOrderId: "wo-qc", pass: true, notes: "QC OK" },
        "coord-1",
      );

      expect(out.vehicleReleased).toBe(true);
      expect(out.logisticsStatus).toBe("VERDE");
      expect(vehicleUpdate).toHaveBeenCalledWith({
        where: { id: "veh-2" },
        data: expect.objectContaining({
          status: VehicleStatus.AVAILABLE,
        }),
      });
    });
  });

  describe("PartDispatchService antifraude", () => {
    it("no permite despachar sin QR/Serial válido", async () => {
      const prisma = {
        workOrder: {
          findFirst: jest.fn().mockResolvedValue({
            id: "wo-1",
            status: WorkOrderStatus.OPEN,
          }),
        },
        inventoryItem: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const svc = new PartDispatchService(prisma as never, {
        emitPartDispatched: jest.fn().mockResolvedValue(undefined),
      } as never);

      await expect(
        svc.dispatchPart("org-1", "user-1", "wo-1", {
          partQr: "QR-FAKE-999",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      try {
        await svc.dispatchPart("org-1", "user-1", "wo-1", {
          partQr: "QR-FAKE-999",
        });
      } catch (e) {
        expect((e as BadRequestException).getResponse()).toMatchObject({
          error: "INVALID_PART_QR_SERIAL",
        });
      }
    });

    it("exige QR o serial en la solicitud", async () => {
      const prisma = {
        workOrder: {
          findFirst: jest.fn().mockResolvedValue({
            id: "wo-1",
            status: WorkOrderStatus.OPEN,
          }),
        },
      };
      const svc = new PartDispatchService(prisma as never, {
        emitPartDispatched: jest.fn().mockResolvedValue(undefined),
      } as never);
      await expect(
        svc.dispatchPart("org-1", "user-1", "wo-1", {}),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          error: "PART_QR_OR_SERIAL_REQUIRED",
        }),
      });
    });
  });
});
