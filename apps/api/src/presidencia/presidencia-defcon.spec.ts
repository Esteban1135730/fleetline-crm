import { planDefconCascade } from "./dto/founder.dto";
import { PresidenciaService } from "./presidencia.service";

describe("planDefconCascade — notificación en cascada", () => {
  it("notifica conductores (sirena) y clientes (WhatsApp/SMS) + War Room", () => {
    const plan = planDefconCascade({
      defconLevel: 2,
      conflictZones: ["Sur Bogotá", "Soacha"],
      driversInZones: 12,
      customersActive: 40,
      parentsActive: 18,
      notifyDrivers: true,
      notifyCustomers: true,
      notifyParents: true,
      openWarRoom: true,
    });

    expect(plan.driversNotified).toBe(12);
    expect(plan.customersNotified).toBe(40);
    expect(plan.parentsNotified).toBe(18);
    expect(plan.warRoomOpen).toBe(true);

    const channels = plan.steps.map((s) => s.channel);
    expect(channels).toContain("APP_DRIVER_SIREN");
    expect(channels).toContain("WHATSAPP");
    expect(channels).toContain("SMS");
    expect(channels).toContain("WAR_ROOM");

    const driverStep = plan.steps.find((s) => s.channel === "APP_DRIVER_SIREN");
    expect(driverStep?.audience).toBe("DRIVERS");
    expect(driverStep?.count).toBe(12);

    const customerWa = plan.steps.find(
      (s) => s.channel === "WHATSAPP" && s.audience === "CUSTOMERS",
    );
    expect(customerWa?.count).toBe(40);
  });

  it("omite audiencias cuando notify* es false", () => {
    const plan = planDefconCascade({
      defconLevel: 2,
      conflictZones: ["Zona A"],
      driversInZones: 5,
      customersActive: 10,
      parentsActive: 3,
      notifyDrivers: false,
      notifyCustomers: false,
      notifyParents: false,
      openWarRoom: true,
    });
    expect(plan.driversNotified).toBe(0);
    expect(plan.customersNotified).toBe(0);
    expect(plan.parentsNotified).toBe(0);
    expect(plan.steps.some((s) => s.channel === "APP_DRIVER_SIREN")).toBe(
      false,
    );
    expect(plan.steps.some((s) => s.channel === "WAR_ROOM")).toBe(true);
  });
});

describe("PresidenciaService.activarDefcon — cascada Kafka", () => {
  it("emite sirena a conductores y blast a clientes", async () => {
    const prisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([
          { id: "d1", name: "A", phone: "300" },
          { id: "d2", name: "B", phone: "301" },
        ]),
      },
      customer: {
        findMany: jest.fn().mockResolvedValue([
          { id: "c1", name: "Cli", phone: "310" },
        ]),
      },
      user: { count: jest.fn().mockResolvedValue(4) },
      presidentialDefconSession: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "def-1", ...data }),
        ),
      },
    };
    const kafka = { emit: jest.fn().mockResolvedValue(undefined) };
    const svc = new PresidenciaService(
      prisma as never,
      {} as never,
      {} as never,
      kafka as never,
    );

    const result = await svc.activarDefcon("org-1", "alejandro", {
      defconLevel: 2,
      conflictZones: ["Kennedy"],
      notifyDrivers: true,
      notifyCustomers: true,
      notifyParents: true,
      openWarRoom: true,
    });

    expect(result.notified.drivers).toBe(2);
    expect(result.notified.customers).toBe(1);
    expect(result.notified.parents).toBe(4);
    expect(result.warRoomOpen).toBe(true);

    expect(kafka.emit).toHaveBeenCalledWith(
      "presidencia.defcon.driver_siren",
      expect.objectContaining({
        siren: true,
        driverIds: ["d1", "d2"],
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      "presidencia.defcon.customer_blast",
      expect.objectContaining({
        channels: ["WHATSAPP", "SMS"],
        customerIds: ["c1"],
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith(
      "presidencia.defcon.cascade",
      expect.objectContaining({ channel: "APP_DRIVER_SIREN" }),
    );
  });
});
