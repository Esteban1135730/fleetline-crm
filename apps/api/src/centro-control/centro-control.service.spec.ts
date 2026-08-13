import { ForbiddenException } from "@nestjs/common";
import { CentroControlService } from "./centro-control.service";

describe("CentroControlService.apagadoRemoto", () => {
  it("transmite comando IoT tras confirmación de protocolo SOS", async () => {
    const prisma = {
      watchtowerSosSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sos-1",
          code: "SOS-2026-0001",
          status: "ACTIVE",
          engineShutdownAuthorized: true,
          vehicleId: "veh-1",
          plate: "BOG-892",
        }),
      },
      watchtowerIotCommand: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: "iot-1",
            ...data,
            status: "SENT",
          }),
        ),
      },
      vehicle: { findFirst: jest.fn() },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new CentroControlService(prisma as never, kafka as never);

    const result = await svc.apagadoRemoto("org-1", "valeria", {
      sosSessionId: "sos-1",
      confirmProtocol: true,
      reason: "Amenaza activa",
    });

    expect(result.transmitted).toBe(true);
    expect(prisma.watchtowerIotCommand.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          command: "ENGINE_SHUTDOWN",
          status: "SENT",
          confirmedProtocol: true,
        }),
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      "watchtower.iot.engine_shutdown",
      expect.objectContaining({ sosSessionId: "sos-1", plate: "BOG-892" }),
    );
  });

  it("rechaza apagado remoto sin protocolo SOS autorizado", async () => {
    const prisma = {
      watchtowerSosSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: "sos-2",
          status: "ACTIVE",
          engineShutdownAuthorized: false,
          vehicleId: "veh-1",
          plate: "BOG-100",
        }),
      },
      watchtowerIotCommand: { create: jest.fn() },
    };
    const kafka = { emit: jest.fn() };
    const svc = new CentroControlService(prisma as never, kafka as never);

    await expect(
      svc.apagadoRemoto("org-1", "valeria", {
        sosSessionId: "sos-2",
        confirmProtocol: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.watchtowerIotCommand.create).not.toHaveBeenCalled();
    expect(kafka.emit).not.toHaveBeenCalled();
  });
});
