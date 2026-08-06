/**
 * INRETRANS OS — Seed demo SSOT (datos visibles en CRM web)
 *
 * Cuentas (password: fsg2026):
 *  - presidencia@fsg.co  → PRESIDENCIA READ_ONLY
 *  - logistica@fsg.co    → DESPACHO (operar CRM)
 *  - revisoria@fsg.co    → REVISORIA READ_ONLY
 *  - conductor@fsg.co    → CONDUCTOR + Driver
 *  - monitora@fsg.co     → monitor escolar
 */
import {
  AccessLevel,
  AccountType,
  ArchiveCategory,
  ArchiveDocType,
  ArchiveValidationStatus,
  B2bServiceRequestKind,
  B2bServiceRequestStatus,
  BoardingPassStatus,
  CommercialChannel,
  ComplianceDocType,
  ContractRateType,
  ContractStatus,
  CustomerSegment,
  DocStatus,
  DriverNoveltyKind,
  EmployeeStatus,
  FleetModule,
  IncidentKind,
  IncidentSeverity,
  IncidentStatus,
  InventoryItemStatus,
  InvoiceStatus,
  InvoiceType,
  JournalEntryStatus,
  PaymentScheduleStatus,
  PesvControlStatus,
  PlanillaStatus,
  PrismaClient,
  PqrsType,
  PurchaseStatus,
  QuoteStatus,
  RoleCode,
  SarlaftAlertStatus,
  SarlaftEntityType,
  SarlaftRisk,
  SchoolBoardingKind,
  SchoolBoardingMethod,
  SchoolRouteDirection,
  SchoolRouteRunStatus,
  SchoolStopKind,
  StudentTripStatus,
  SystemLogLevel,
  ThreeWayMatchStatus,
  TicketChannel,
  TicketPriority,
  TicketStatus,
  TripStatus,
  VehicleStatus,
  VisitorKind,
  WorkOrderStatus,
  YardAccessKind,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

const ALL_MODULES: FleetModule[] = [
  FleetModule.PRESIDENCIA,
  FleetModule.GERENCIA,
  FleetModule.COMERCIAL,
  FleetModule.LOGISTICA,
  FleetModule.PARQUEADERO,
  FleetModule.TRAMITES,
  FleetModule.TALLER,
  FleetModule.COMPRAS,
  FleetModule.TESORERIA,
  FleetModule.CONTABILIDAD,
  FleetModule.REVISORIA,
  FleetModule.RRHH,
  FleetModule.RECEPCION_CALLCENTER,
  FleetModule.HQSE,
  FleetModule.SARLAFT,
  FleetModule.ARCHIVO,
  FleetModule.TECNOLOGIA,
  FleetModule.APP_CONDUCTOR,
  FleetModule.APP_MONITORA,
  FleetModule.APP_PADRES,
  FleetModule.APP_PASAJEROS,
];

/** Despacho demo: escritura operativa amplia para revisar el CRM. */
const DESPACHO_WRITE: FleetModule[] = [
  FleetModule.LOGISTICA,
  FleetModule.PARQUEADERO,
  FleetModule.TRAMITES,
  FleetModule.COMERCIAL,
  FleetModule.TALLER,
  FleetModule.COMPRAS,
  FleetModule.TESORERIA,
  FleetModule.CONTABILIDAD,
  FleetModule.RRHH,
  FleetModule.RECEPCION_CALLCENTER,
  FleetModule.HQSE,
  FleetModule.SARLAFT,
  FleetModule.ARCHIVO,
  FleetModule.GERENCIA,
];

const DEMO_PASSWORD = "fsg2026";

function daysFromNow(d: number) {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x;
}

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 3600_000);
}

async function wipe() {
  // Truncate total — orden irrelevante con CASCADE
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ) LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
      END LOOP;
    END $$;
  `);
}

async function seedRoleMatrix(organizationId: string) {
  const rows: {
    organizationId: string;
    role: RoleCode;
    module: FleetModule;
    access: AccessLevel;
    forceReadOnly: boolean;
  }[] = [];

  for (const module of ALL_MODULES) {
    rows.push({
      organizationId,
      role: RoleCode.PRESIDENCIA,
      module,
      access: AccessLevel.READ_ONLY,
      forceReadOnly: true,
    });
    rows.push({
      organizationId,
      role: RoleCode.REVISORIA,
      module,
      access: AccessLevel.READ_ONLY,
      forceReadOnly: true,
    });
    const write = DESPACHO_WRITE.includes(module);
    rows.push({
      organizationId,
      role: RoleCode.DESPACHO,
      module,
      access: write ? AccessLevel.READ_WRITE : AccessLevel.READ_ONLY,
      forceReadOnly: false,
    });
    let conductorAccess = AccessLevel.NONE;
    if (module === FleetModule.APP_CONDUCTOR) conductorAccess = AccessLevel.READ_WRITE;
    if (module === FleetModule.LOGISTICA) conductorAccess = AccessLevel.READ_ONLY;
    rows.push({
      organizationId,
      role: RoleCode.CONDUCTOR,
      module,
      access: conductorAccess,
      forceReadOnly: false,
    });
  }

  await prisma.rolePermission.createMany({ data: rows });
  return rows.length;
}

async function main() {
  console.log("[seed] INRETRANS OS — demo datos CRM");
  await wipe();

  const org = await prisma.organization.create({
    data: { name: "FSG Transportes S.A.S.", nit: "900123456-1" },
  });
  console.log(`[seed] Org: ${org.name}`);

  const permCount = await seedRoleMatrix(org.id);
  console.log(`[seed] RBAC: ${permCount} RolePermission`);

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const presidenci = await prisma.user.create({
    data: {
      email: "presidencia@fsg.co",
      name: "Ana Presidencia (Directivo)",
      role: RoleCode.PRESIDENCIA,
      directiveReadOnly: true,
      passwordHash,
      organizationId: org.id,
    },
  });
  const logistica = await prisma.user.create({
    data: {
      email: "logistica@fsg.co",
      name: "Luis Director Logística",
      role: RoleCode.DESPACHO,
      passwordHash,
      organizationId: org.id,
    },
  });
  const auditor = await prisma.user.create({
    data: {
      email: "revisoria@fsg.co",
      name: "Elena Auditora Revisoría",
      role: RoleCode.REVISORIA,
      directiveReadOnly: true,
      passwordHash,
      organizationId: org.id,
    },
  });
  const conductorUser = await prisma.user.create({
    data: {
      email: "conductor@fsg.co",
      name: "Carlos Conductor Prueba",
      role: RoleCode.CONDUCTOR,
      passwordHash,
      organizationId: org.id,
    },
  });
  const monitoraUser = await prisma.user.create({
    data: {
      email: "monitora@fsg.co",
      name: "María Monitora Escolar",
      role: RoleCode.DESPACHO,
      passwordHash,
      organizationId: org.id,
    },
  });

  const licenseOk = daysFromNow(730);
  const driverCarlos = await prisma.driver.create({
    data: {
      name: "Carlos Conductor Prueba",
      document: "1001001001",
      phone: "3001112233",
      licenseNumber: "LIC-DEMO-001",
      licenseExpiresAt: licenseOk,
      licenseCategory: "C2",
      active: true,
      fatigueScore: 12,
      userId: conductorUser.id,
      organizationId: org.id,
    },
  });
  const driverPedro = await prisma.driver.create({
    data: {
      name: "Pedro Rutas Norte",
      document: "1002002002",
      phone: "3104445566",
      licenseNumber: "LIC-DEMO-002",
      licenseExpiresAt: daysFromNow(20),
      licenseCategory: "C2",
      active: true,
      fatigueScore: 45,
      organizationId: org.id,
    },
  });
  const driverLucia = await prisma.driver.create({
    data: {
      name: "Lucía Escolar Sur",
      document: "1003003003",
      phone: "3207778899",
      licenseNumber: "LIC-DEMO-003",
      licenseExpiresAt: daysFromNow(-5),
      licenseCategory: "C1",
      active: true,
      fatigueScore: 88,
      dispatchBlocked: true,
      blockReason: "DRIVER_FATIGUE",
      organizationId: org.id,
    },
  });

  const monitor = await prisma.monitorProfile.create({
    data: { userId: monitoraUser.id, organizationId: org.id, active: true },
  });

  // ——— Flota ———
  const soatOk = daysFromNow(240);
  const tecnoOk = daysFromNow(180);
  const soatExpired = daysFromNow(-60);

  const bus001 = await prisma.vehicle.create({
    data: {
      plate: "BUS-001",
      brand: "Mercedes-Benz",
      model: "OF-1721",
      year: 2022,
      capacity: 40,
      status: VehicleStatus.IN_SERVICE,
      odometerKm: 48200,
      soatActivo: true,
      tecnoActiva: true,
      lat: 4.710989,
      lng: -74.072092,
      organizationId: org.id,
    },
  });
  const bus002 = await prisma.vehicle.create({
    data: {
      plate: "BUS-002",
      brand: "Chevrolet",
      model: "NPR",
      year: 2018,
      capacity: 28,
      status: VehicleStatus.COMPLIANCE_BLOCKED,
      odometerKm: 121000,
      soatActivo: false,
      tecnoActiva: true,
      complianceBlocked: true,
      complianceReason: "HARD-STOP: SOAT vencido — unidad no despachable",
      lat: 4.6486,
      lng: -74.107,
      organizationId: org.id,
    },
  });
  const bus003 = await prisma.vehicle.create({
    data: {
      plate: "ESC-010",
      brand: "Hino",
      model: "AK8J",
      year: 2021,
      capacity: 35,
      status: VehicleStatus.AVAILABLE,
      odometerKm: 31500,
      soatActivo: true,
      tecnoActiva: true,
      lat: 4.6682,
      lng: -74.0531,
      organizationId: org.id,
    },
  });
  const bus004 = await prisma.vehicle.create({
    data: {
      plate: "TUR-220",
      brand: "Marcopolo",
      model: "G7",
      year: 2020,
      capacity: 44,
      status: VehicleStatus.MAINTENANCE,
      odometerKm: 89000,
      soatActivo: true,
      tecnoActiva: true,
      lat: 4.625,
      lng: -74.081,
      organizationId: org.id,
    },
  });

  await prisma.complianceDocument.createMany({
    data: [
      {
        organizationId: org.id,
        vehicleId: bus001.id,
        type: ComplianceDocType.SOAT,
        status: DocStatus.VALID,
        reference: "SOAT-BUS001-VIGENTE",
        issuedAt: new Date(),
        expiresAt: soatOk,
        runtVerified: true,
      },
      {
        organizationId: org.id,
        vehicleId: bus001.id,
        type: ComplianceDocType.TECNOMECANICA,
        status: DocStatus.VALID,
        reference: "TM-BUS001-VIGENTE",
        issuedAt: new Date(),
        expiresAt: tecnoOk,
        runtVerified: true,
      },
      {
        organizationId: org.id,
        driverId: driverCarlos.id,
        type: ComplianceDocType.LICENCIA_CONDUCCION,
        status: DocStatus.VALID,
        reference: "LIC-DEMO-001",
        expiresAt: licenseOk,
        runtVerified: true,
      },
      {
        organizationId: org.id,
        vehicleId: bus002.id,
        type: ComplianceDocType.SOAT,
        status: DocStatus.EXPIRED,
        reference: "SOAT-BUS002-VENCIDO",
        issuedAt: daysFromNow(-425),
        expiresAt: soatExpired,
        runtVerified: false,
        notes: "Fixture Hard-Stop legal",
      },
      {
        organizationId: org.id,
        vehicleId: bus002.id,
        type: ComplianceDocType.TECNOMECANICA,
        status: DocStatus.VALID,
        reference: "TM-BUS002-OK",
        expiresAt: daysFromNow(90),
        runtVerified: true,
      },
      {
        organizationId: org.id,
        vehicleId: bus003.id,
        type: ComplianceDocType.SOAT,
        status: DocStatus.VALID,
        reference: "SOAT-ESC010",
        expiresAt: daysFromNow(200),
        runtVerified: true,
      },
      {
        organizationId: org.id,
        vehicleId: bus003.id,
        type: ComplianceDocType.TECNOMECANICA,
        status: DocStatus.VALID,
        reference: "TM-ESC010",
        expiresAt: daysFromNow(150),
        runtVerified: true,
      },
      {
        organizationId: org.id,
        vehicleId: bus004.id,
        type: ComplianceDocType.SOAT,
        status: DocStatus.VALID,
        reference: "SOAT-TUR220",
        expiresAt: daysFromNow(100),
        runtVerified: true,
      },
      {
        organizationId: org.id,
        vehicleId: bus004.id,
        type: ComplianceDocType.TECNOMECANICA,
        status: DocStatus.VALID,
        reference: "TM-TUR220",
        expiresAt: daysFromNow(80),
        runtVerified: true,
      },
    ],
  });

  await prisma.gpsSnapshot.createMany({
    data: [
      { vehicleId: bus001.id, lat: 4.710989, lng: -74.072092, speedKph: 42, heading: 180 },
      { vehicleId: bus001.id, lat: 4.705, lng: -74.068, speedKph: 38, heading: 195 },
      { vehicleId: bus003.id, lat: 4.6682, lng: -74.0531, speedKph: 0, heading: 90 },
    ],
  });

  // ——— Comercial ———
  const custB2b = await prisma.customer.create({
    data: {
      name: "Ecopetrol Movilidad Corp",
      nit: "899999068-1",
      email: "movilidad@ecopetrol.demo",
      phone: "6012345678",
      segment: CustomerSegment.B2B,
      organizationId: org.id,
    },
  });
  const custEscolar = await prisma.customer.create({
    data: {
      name: "Colegio Andino Norte",
      nit: "830012345-6",
      email: "transporte@andino.demo",
      phone: "6019876543",
      segment: CustomerSegment.ESCOLAR,
      organizationId: org.id,
    },
  });
  const custTurismo = await prisma.customer.create({
    data: {
      name: "Viajes Andes SAS",
      nit: "900555111-2",
      email: "ops@andesviajes.demo",
      phone: "3005551212",
      segment: CustomerSegment.TURISMO,
      organizationId: org.id,
    },
  });
  const custB2g = await prisma.customer.create({
    data: {
      name: "Alcaldía de Bogotá — SDDE",
      nit: "899999061-9",
      email: "contratacion@sdde.demo",
      phone: "6013813000",
      segment: CustomerSegment.B2G,
      organizationId: org.id,
    },
  });

  await prisma.quote.createMany({
    data: [
      {
        code: "COT-2026-0001",
        customerId: custB2b.id,
        amount: 18500000,
        status: QuoteStatus.WON,
        notes: "Corredor Bogotá–Refinería · 12 servicios/mes",
        calcJson: {
          distanciaKm: 120,
          peajes: 4,
          margenPct: 30,
          total: 18500000,
        },
      },
      {
        code: "COT-2026-0002",
        customerId: custEscolar.id,
        amount: 42000000,
        status: QuoteStatus.APPROVED,
        notes: "Ruta escolar mañana/tarde · 2 buses",
      },
      {
        code: "COT-2026-0003",
        customerId: custTurismo.id,
        amount: 9800000,
        status: QuoteStatus.SENT,
        notes: "Charter Bogotá–Villa de Leyva fin de semana",
      },
      {
        code: "COT-2026-0004",
        customerId: custB2g.id,
        amount: 125000000,
        status: QuoteStatus.DRAFT,
        notes: "SECOP II — proceso especial",
        secopRef: "SECOP-DEMO-2026-441",
      },
    ],
  });

  const contractB2b = await prisma.transportContract.create({
    data: {
      code: "CTR-2026-0001",
      name: "Marco Ecopetrol Movilidad 2026",
      channel: CommercialChannel.PRIVATE,
      routeLabel: "Bogotá ↔ Barrancabermeja",
      monthlyValue: 18500000,
      budgetCap: 222000000,
      budgetConsumed: 37000000,
      tripQuota: 144,
      tripsUsed: 2,
      vehicleQuota: 4,
      vehiclesAllocated: 1,
      rateType: ContractRateType.FIXED,
      fixedFare: 1850000,
      startsAt: daysFromNow(-90),
      endsAt: daysFromNow(275),
      status: ContractStatus.ACTIVE,
      customerId: custB2b.id,
      organizationId: org.id,
    },
  });
  const contractEscolar = await prisma.transportContract.create({
    data: {
      code: "CTR-2026-0002",
      name: "Escolar Andino Norte 2026",
      channel: CommercialChannel.PRIVATE,
      routeLabel: "Usaquén → Colegio Andino",
      monthlyValue: 42000000,
      budgetCap: 504000000,
      budgetConsumed: 84000000,
      tripQuota: 400,
      tripsUsed: 40,
      vehicleQuota: 2,
      vehiclesAllocated: 1,
      rateType: ContractRateType.FIXED,
      fixedFare: 210000,
      startsAt: daysFromNow(-120),
      endsAt: daysFromNow(240),
      status: ContractStatus.ACTIVE,
      customerId: custEscolar.id,
      organizationId: org.id,
    },
  });
  await prisma.transportContract.create({
    data: {
      code: "CTR-2026-0003",
      name: "Turismo Andes — charter flexible",
      channel: CommercialChannel.PRIVATE,
      routeLabel: "Nacional turismo",
      monthlyValue: 0,
      budgetCap: 80000000,
      budgetConsumed: 9800000,
      tripQuota: 24,
      tripsUsed: 1,
      rateType: ContractRateType.PER_KM,
      ratePerKm: 4200,
      startsAt: daysFromNow(-30),
      endsAt: daysFromNow(335),
      status: ContractStatus.ACTIVE,
      customerId: custTurismo.id,
      organizationId: org.id,
    },
  });
  await prisma.transportContract.create({
    data: {
      code: "CTR-2026-0004",
      name: "SECOP SDDE — borrador",
      channel: CommercialChannel.PUBLIC_TENDER,
      routeLabel: "Distrito Capital — rutas especiales",
      monthlyValue: 45000000,
      secopProcessId: "SECOP-DEMO-2026-441",
      startsAt: daysFromNow(30),
      endsAt: daysFromNow(395),
      status: ContractStatus.DRAFT,
      customerId: custB2g.id,
      organizationId: org.id,
    },
  });

  await prisma.secopOpportunity.create({
    data: {
      organizationId: org.id,
      processId: "SECOP-DEMO-2026-441",
      title: "Servicio especial de transporte SDDE 2026",
      entityName: "Alcaldía de Bogotá — SDDE",
      modality: "Concurso de méritos",
      status: "OPEN",
      category: "Transporte especial",
      estimatedValue: 125000000,
      publishAt: daysFromNow(-14),
      closeAt: daysFromNow(45),
      url: "https://secop.demo/proceso/441",
      rawPayload: { fuente: "seed" },
    },
  });

  // ——— Rutas & viajes ———
  const routeBogMed = await prisma.route.create({
    data: {
      organizationId: org.id,
      code: "R-BOG-MED",
      name: "Bogotá → Medellín",
      origin: "Bogotá Terminal Salitre",
      destination: "Medellín Terminal Norte",
      distanceKm: 420,
      etaMinutes: 480,
    },
  });
  const routeCorp = await prisma.route.create({
    data: {
      organizationId: org.id,
      code: "R-BOG-BCA",
      name: "Bogotá → Barranca",
      origin: "Bogotá Norte",
      destination: "Barrancabermeja Refinería",
      distanceKm: 380,
      etaMinutes: 420,
    },
  });
  const routeLocal = await prisma.route.create({
    data: {
      organizationId: org.id,
      code: "R-USQ-AND",
      name: "Usaquén escolar",
      origin: "Usaquén",
      destination: "Colegio Andino Norte",
      distanceKm: 12,
      etaMinutes: 35,
    },
  });

  const tripTransit = await prisma.trip.create({
    data: {
      code: "TRP-2026-0001",
      origin: "Bogotá Norte",
      destination: "Barrancabermeja Refinería",
      departAt: hoursFromNow(-2),
      status: TripStatus.IN_TRANSIT,
      fareAmount: 1850000,
      distanceKm: 380,
      customerId: custB2b.id,
      contractId: contractB2b.id,
      vehicleId: bus001.id,
      driverId: driverCarlos.id,
      routeId: routeCorp.id,
      organizationId: org.id,
    },
  });
  const tripAssigned = await prisma.trip.create({
    data: {
      code: "TRP-2026-0002",
      origin: "Usaquén",
      destination: "Colegio Andino Norte",
      departAt: hoursFromNow(3),
      status: TripStatus.ASSIGNED,
      fareAmount: 210000,
      distanceKm: 12,
      customerId: custEscolar.id,
      contractId: contractEscolar.id,
      vehicleId: bus003.id,
      driverId: driverLucia.id,
      routeId: routeLocal.id,
      organizationId: org.id,
    },
  });
  const tripPending = await prisma.trip.create({
    data: {
      code: "TRP-2026-0003",
      origin: "Bogotá Terminal Salitre",
      destination: "Medellín Terminal Norte",
      departAt: hoursFromNow(26),
      status: TripStatus.PENDING,
      fareAmount: 9800000,
      distanceKm: 420,
      customerId: custTurismo.id,
      routeId: routeBogMed.id,
      organizationId: org.id,
    },
  });
  const tripDone = await prisma.trip.create({
    data: {
      code: "TRP-2026-0004",
      origin: "Bogotá Norte",
      destination: "Barrancabermeja Refinería",
      departAt: daysFromNow(-3),
      status: TripStatus.COMPLETED,
      fareAmount: 1850000,
      distanceKm: 380,
      customerId: custB2b.id,
      contractId: contractB2b.id,
      vehicleId: bus001.id,
      driverId: driverPedro.id,
      routeId: routeCorp.id,
      organizationId: org.id,
    },
  });
  await prisma.trip.create({
    data: {
      code: "TRP-2026-0005",
      origin: "Calle 100",
      destination: "Aeropuerto El Dorado",
      departAt: hoursFromNow(-5),
      status: TripStatus.INCIDENT,
      fareAmount: 450000,
      distanceKm: 18,
      incidentNote: "Demora en acceso — congestión vía Calle 26",
      customerId: custB2b.id,
      contractId: contractB2b.id,
      vehicleId: bus001.id,
      driverId: driverCarlos.id,
      organizationId: org.id,
    },
  });

  const planilla = await prisma.planilla.create({
    data: {
      code: "PLN-2026-0001",
      status: PlanillaStatus.EN_RUTA,
      tripId: tripTransit.id,
      vehicleId: bus001.id,
      driverId: driverCarlos.id,
      routeId: routeCorp.id,
      organizationId: org.id,
      releasedAt: hoursFromNow(-3),
      startedAt: hoursFromNow(-2),
      rutaSugerida: "Autopista Norte → Ruta del Sol",
    },
  });

  await prisma.preoperational.create({
    data: {
      tripId: tripTransit.id,
      driverId: driverCarlos.id,
      brakesOk: true,
      lightsOk: true,
      tiresOk: true,
      kitOk: true,
      oilOk: true,
      approved: true,
      observations: "Preoperacional nominal",
    },
  });

  await prisma.fuecDocument.create({
    data: {
      number: "FUEC-2026-88421",
      contractorName: custB2b.name,
      routeLabel: "Bogotá ↔ Barrancabermeja",
      validFrom: daysFromNow(-5),
      validTo: daysFromNow(25),
      status: DocStatus.VALID,
      cryptoHash: `sha256:${randomUUID().replace(/-/g, "")}`,
      qrPayload: `FUEC|FUEC-2026-88421|${bus001.plate}`,
      vehicleId: bus001.id,
      planillaId: planilla.id,
      organizationId: org.id,
    },
  });

  await prisma.routeExpense.createMany({
    data: [
      { tripId: tripTransit.id, kind: "PEAJE", amount: 68000, station: "Andes" },
      { tripId: tripTransit.id, kind: "COMBUSTIBLE", amount: 420000, gallons: 35, station: "Terpel Norte" },
      { tripId: tripDone.id, kind: "PEAJE", amount: 68000, station: "Andes" },
      { tripId: tripDone.id, kind: "COMBUSTIBLE", amount: 390000, gallons: 32, station: "Primax" },
    ],
  });

  // ——— Taller / inventario ———
  const supplierParts = await prisma.supplier.create({
    data: {
      name: "Repuestos Automotrices del Norte",
      nit: "900111222-3",
      email: "ventas@repnorte.demo",
      phone: "6015550101",
      productTags: ["frenos", "filtros", "aceite"],
      organizationId: org.id,
    },
  });
  const supplierFuel = await prisma.supplier.create({
    data: {
      name: "Combustibles Andinos",
      nit: "800222333-4",
      email: "facturacion@combandinos.demo",
      productTags: ["diesel", "ACPM"],
      organizationId: org.id,
    },
  });

  const partBrake = await prisma.inventoryItem.create({
    data: {
      sku: "FRN-PAD-MB40",
      name: "Pastillas freno delanteras MB OF",
      qrCode: "QR-PART-FRN-001",
      quantity: 12,
      minStock: 4,
      unitCost: 185000,
      status: InventoryItemStatus.AVAILABLE,
      organizationId: org.id,
      supplierId: supplierParts.id,
    },
  });
  await prisma.inventoryItem.create({
    data: {
      sku: "FLT-ACE-15W40",
      name: "Filtro aceite 15W40",
      qrCode: "QR-PART-FLT-002",
      quantity: 2,
      minStock: 6,
      unitCost: 42000,
      status: InventoryItemStatus.AVAILABLE,
      organizationId: org.id,
      supplierId: supplierParts.id,
    },
  });

  const woOpen = await prisma.workOrder.create({
    data: {
      code: "OT-2026-0012",
      description: "Cambio pastillas + revisión sistema frenado",
      status: WorkOrderStatus.IN_PROGRESS,
      odometerAtOpen: 88950,
      vehicleId: bus004.id,
      assignedToId: logistica.id,
      organizationId: org.id,
    },
  });
  await prisma.workOrderPart.create({
    data: { workOrderId: woOpen.id, inventoryItemId: partBrake.id, quantity: 1 },
  });
  await prisma.workOrder.create({
    data: {
      code: "OT-2026-0008",
      description: "Mantenimiento preventivo 80.000 km",
      status: WorkOrderStatus.DONE,
      odometerAtOpen: 80000,
      vehicleId: bus001.id,
      organizationId: org.id,
      closedAt: daysFromNow(-20),
    },
  });

  const po = await prisma.purchaseOrder.create({
    data: {
      code: "OC-2026-0044",
      description: "Reposición pastillas y filtros",
      status: PurchaseStatus.ORDERED,
      totalEstimated: 920000,
      matchStatus: ThreeWayMatchStatus.PENDING,
      supplierId: supplierParts.id,
      approvedById: logistica.id,
      organizationId: org.id,
    },
  });
  await prisma.purchaseOrderLine.create({
    data: {
      purchaseOrderId: po.id,
      inventoryItemId: partBrake.id,
      description: "Pastillas freno delanteras",
      quantity: 4,
      unitCost: 185000,
      lineTotal: 740000,
    },
  });

  // ——— Finanzas ———
  const invRecv = await prisma.invoice.create({
    data: {
      number: "FV-2026-00101",
      type: InvoiceType.RECEIVABLE,
      status: InvoiceStatus.ISSUED,
      counterparty: custB2b.name,
      amount: 1850000,
      dueDate: daysFromNow(15),
      customerId: custB2b.id,
      tripId: tripDone.id,
      organizationId: org.id,
    },
  });
  await prisma.invoice.create({
    data: {
      number: "FV-2026-00102",
      type: InvoiceType.RECEIVABLE,
      status: InvoiceStatus.OVERDUE,
      counterparty: custEscolar.name,
      amount: 42000000,
      dueDate: daysFromNow(-12),
      customerId: custEscolar.id,
      organizationId: org.id,
    },
  });
  const invPay = await prisma.invoice.create({
    data: {
      number: "FC-PROV-7781",
      type: InvoiceType.SUPPLIER_ELECTRONIC,
      status: InvoiceStatus.PENDING_MATCH,
      counterparty: supplierParts.name,
      amount: 920000,
      dueDate: daysFromNow(10),
      supplierId: supplierParts.id,
      purchaseOrderId: po.id,
      organizationId: org.id,
    },
  });
  await prisma.invoice.create({
    data: {
      number: "FV-2026-00098",
      type: InvoiceType.RECEIVABLE,
      status: InvoiceStatus.PAID,
      counterparty: custTurismo.name,
      amount: 9800000,
      dueDate: daysFromNow(-40),
      paidAt: daysFromNow(-35),
      customerId: custTurismo.id,
      organizationId: org.id,
    },
  });

  await prisma.paymentSchedule.create({
    data: {
      organizationId: org.id,
      invoiceId: invPay.id,
      purchaseOrderId: po.id,
      amount: 920000,
      counterparty: supplierParts.name,
      status: PaymentScheduleStatus.QUEUED,
      dueDate: daysFromNow(10),
    },
  });

  const accBank = await prisma.account.create({
    data: {
      code: "1105",
      name: "Bancos",
      type: AccountType.ASSET,
      organizationId: org.id,
    },
  });
  const accIncome = await prisma.account.create({
    data: {
      code: "4135",
      name: "Ingresos transporte",
      type: AccountType.INCOME,
      organizationId: org.id,
    },
  });
  const accExpense = await prisma.account.create({
    data: {
      code: "5135",
      name: "Combustible y peajes",
      type: AccountType.EXPENSE,
      organizationId: org.id,
    },
  });
  const je = await prisma.journalEntry.create({
    data: {
      memo: "Reconocimiento ingreso TRP-2026-0004",
      status: JournalEntryStatus.POSTED,
      postedAt: daysFromNow(-2),
      organizationId: org.id,
    },
  });
  await prisma.journalLine.create({
    data: {
      entryId: je.id,
      debitAccountId: accBank.id,
      creditAccountId: accIncome.id,
      amount: 1850000,
    },
  });
  await prisma.forensicFinding.create({
    data: {
      title: "Desfase peajes vs planilla",
      severity: "MEDIUM",
      detail: "Gasto peaje reportado sin soporte OCR en viaje TRP-2026-0001",
      organizationId: org.id,
    },
  });

  // ——— RRHH ———
  await prisma.employee.create({
    data: {
      name: "Luis Director Logística",
      document: "80111222",
      title: "Director de Logística",
      area: "Operaciones",
      status: EmployeeStatus.ACTIVE,
      baseSalary: 8500000,
      hourlyRate: 45000,
      email: "logistica@fsg.co",
      organizationId: org.id,
    },
  });
  await prisma.employee.create({
    data: {
      name: "Sofía Nómina",
      document: "52999888",
      title: "Analista RRHH",
      area: "Talento Humano",
      status: EmployeeStatus.ACTIVE,
      baseSalary: 4200000,
      hourlyRate: 28000,
      organizationId: org.id,
    },
  });
  await prisma.employee.create({
    data: {
      name: "Carlos Conductor Prueba",
      document: "1001001001",
      title: "Conductor C2",
      area: "Flota",
      status: EmployeeStatus.ACTIVE,
      baseSalary: 2800000,
      hourlyRate: 18000,
      fatigueScore: 12,
      driverId: driverCarlos.id,
      organizationId: org.id,
    },
  });
  await prisma.employee.create({
    data: {
      name: "Pedro Rutas Norte",
      document: "1002002002",
      title: "Conductor C2",
      area: "Flota",
      status: EmployeeStatus.ACTIVE,
      baseSalary: 2600000,
      hourlyRate: 17000,
      fatigueScore: 45,
      driverId: driverPedro.id,
      organizationId: org.id,
    },
  });
  await prisma.employee.create({
    data: {
      name: "Lucía Escolar Sur",
      document: "1003003003",
      title: "Conductora C1",
      area: "Flota",
      status: EmployeeStatus.ACTIVE,
      baseSalary: 2500000,
      hourlyRate: 16000,
      fatigueScore: 88,
      driverId: driverLucia.id,
      organizationId: org.id,
    },
  });

  await prisma.hqseTrainingRecord.createMany({
    data: [
      {
        driverId: driverCarlos.id,
        topic: "PESV — Fatiga operativa",
        completedAt: daysFromNow(-40),
        expiresAt: daysFromNow(325),
        provider: "FSG Academia",
        organizationId: org.id,
      },
      {
        driverId: driverPedro.id,
        topic: "Manejo defensivo",
        completedAt: daysFromNow(-10),
        expiresAt: daysFromNow(355),
        provider: "SENA Movilidad",
        organizationId: org.id,
      },
    ],
  });

  // ——— PQRS / Call center / Recepción ———
  await prisma.ticket.createMany({
    data: [
      {
        code: "PQRS-2026-001",
        subject: "Retraso en ruta corporativa",
        requester: "Coord. Movilidad Ecopetrol",
        channel: TicketChannel.EMAIL,
        message: "Unidad llegó 40 min tarde al punto de embarque Norte.",
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.HIGH,
        pqrsType: PqrsType.COMPLAINT,
        customerId: custB2b.id,
        vehicleId: bus001.id,
        driverId: driverCarlos.id,
        slaHours: 24,
        slaDueAt: hoursFromNow(8),
        assigneeId: logistica.id,
        organizationId: org.id,
      },
      {
        code: "PQRS-2026-002",
        subject: "Solicitud certificado de servicio",
        requester: "Padre de familia Andino",
        channel: TicketChannel.WHATSAPP,
        message: "Necesito constancia de transporte escolar para matrícula.",
        status: TicketStatus.OPEN,
        priority: TicketPriority.MEDIUM,
        pqrsType: PqrsType.PETITION,
        customerId: custEscolar.id,
        slaHours: 48,
        slaDueAt: hoursFromNow(40),
        organizationId: org.id,
      },
      {
        code: "TKT-HD-881",
        subject: "App conductor — sync GPS intermitente",
        requester: "Carlos Conductor",
        channel: TicketChannel.PHONE,
        message: "Señal uplink GPS se pierde en túnel Calle 26.",
        status: TicketStatus.RESOLVED,
        priority: TicketPriority.LOW,
        resolvedAt: daysFromNow(-1),
        resolutionNotes: "Reintento uplink documentado; nominal post-túnel.",
        organizationId: org.id,
      },
    ],
  });

  await prisma.visitor.createMany({
    data: [
      {
        name: "Andrés Proveedor",
        document: "80123456",
        company: supplierParts.name,
        reason: "Entrega remisión OC-2026-0044",
        hostName: "Almacén Taller",
        kind: VisitorKind.CONTRACTOR,
        siteLabel: "Patio Principal",
        arlValid: true,
        arlExpiresAt: daysFromNow(90),
        passCode: "VIS-4412",
        badgeIssuedAt: hoursFromNow(-1),
        organizationId: org.id,
      },
      {
        name: "Clara Cliente B2B",
        document: "52987654",
        company: custB2b.name,
        reason: "Reunión cupo contractual",
        hostName: "Luis Logística",
        kind: VisitorKind.VISITOR,
        siteLabel: "HQ Comercial",
        passCode: "VIS-4413",
        checkedOutAt: hoursFromNow(-0.5),
        organizationId: org.id,
      },
    ],
  });

  await prisma.qualityEvent.createMany({
    data: [
      {
        kind: "NPS",
        title: "NPS post-viaje corporativo",
        status: "CLOSED",
        npsScore: 9,
        organizationId: org.id,
      },
      {
        kind: "QUEJA",
        title: "Temperatura A/C insuficiente",
        status: "OPEN",
        npsScore: 4,
        organizationId: org.id,
      },
    ],
  });

  // ——— HQSE ———
  await prisma.hqseIncident.createMany({
    data: [
      {
        code: "INC-2026-003",
        kind: IncidentKind.NEAR_MISS,
        severity: IncidentSeverity.MODERATE,
        status: IncidentStatus.INVESTIGATING,
        title: "Casi-colisión en acceso patio",
        description: "Unidad externa no respetó señalización de talanquera.",
        occurredAt: daysFromNow(-2),
        location: "Patio Principal — Gate 2",
        vehicleId: bus003.id,
        organizationId: org.id,
      },
      {
        code: "INC-2026-001",
        kind: IncidentKind.SST_FINDING,
        severity: IncidentSeverity.MINOR,
        status: IncidentStatus.CLOSED,
        title: "Falta de EPP en zona de taller",
        occurredAt: daysFromNow(-18),
        location: "Taller",
        organizationId: org.id,
      },
    ],
  });
  await prisma.pesvRiskControl.createMany({
    data: [
      {
        code: "PESV-01",
        category: "Velocidad",
        title: "Control de velocidad en corredor urbano",
        status: PesvControlStatus.COMPLIANT,
        residualRisk: 2,
        lastReviewedAt: daysFromNow(-7),
        organizationId: org.id,
      },
      {
        code: "PESV-02",
        category: "Fatiga",
        title: "Monitoreo score fatiga conductores",
        status: PesvControlStatus.PARTIAL,
        residualRisk: 3,
        organizationId: org.id,
      },
    ],
  });

  // ——— SARLAFT ———
  await prisma.sarlaftCheck.createMany({
    data: [
      {
        subjectName: custB2b.name,
        document: custB2b.nit,
        risk: SarlaftRisk.LOW,
        riskScore: 12,
        entityType: SarlaftEntityType.CUSTOMER,
        entityId: custB2b.id,
        listsMatched: [],
        status: SarlaftAlertStatus.RESOLVED,
        customerId: custB2b.id,
        resolvedAt: daysFromNow(-60),
        resolvedById: auditor.id,
        organizationId: org.id,
      },
      {
        subjectName: "Tercero sospechoso demo",
        document: "900000999-9",
        risk: SarlaftRisk.HIGH,
        riskScore: 82,
        entityType: SarlaftEntityType.THIRD_PARTY,
        listsMatched: ["PEPS", "NACIONAL"],
        status: SarlaftAlertStatus.PENDING,
        notes: "Hit PEPS — revisión Compliance requerida",
        organizationId: org.id,
      },
    ],
  });

  // ——— Patio / parqueadero ———
  const parking = await prisma.parkingLog.create({
    data: {
      plate: bus003.plate,
      driverName: driverLucia.name,
      guardName: "Vigilante Gate 1",
      vehicleId: bus003.id,
      driverId: driverLucia.id,
      odometerInKm: 31500,
      organizationId: org.id,
    },
  });
  await prisma.yardAccessLog.create({
    data: {
      organizationId: org.id,
      kind: YardAccessKind.CHECK_IN,
      plate: bus003.plate,
      vehicleId: bus003.id,
      driverId: driverLucia.id,
      parkingLogId: parking.id,
      odometerKm: 31500,
      gateId: "GATE-1",
      lprConfidence: 0.97,
      gateOpened: true,
    },
  });
  await prisma.yardEvent.create({
    data: {
      kind: "ENTRY",
      vehicleId: bus003.id,
      organizationId: org.id,
      payload: { plate: bus003.plate, source: "seed" },
    },
  });
  await prisma.parkingLog.create({
    data: {
      plate: bus001.plate,
      driverName: driverCarlos.name,
      vehicleId: bus001.id,
      driverId: driverCarlos.id,
      checkedInAt: daysFromNow(-1),
      checkedOutAt: hoursFromNow(-3),
      odometerInKm: 48000,
      odometerOutKm: 48200,
      organizationId: org.id,
    },
  });

  // ——— Archivo ———
  await prisma.archiveDocument.createMany({
    data: [
      {
        title: "SOAT BUS-001 vigente",
        category: ArchiveCategory.COMPLIANCE,
        docType: ArchiveDocType.SOAT,
        validationStatus: ArchiveValidationStatus.VALIDATED,
        tags: ["SOAT", "BUS-001"],
        vehicleId: bus001.id,
        uploadedById: logistica.id,
        organizationId: org.id,
        contentHash: `hash-${randomUUID()}`,
      },
      {
        title: "Contrato marco Ecopetrol",
        category: ArchiveCategory.CONTRACT,
        docType: ArchiveDocType.CONTRACT,
        validationStatus: ArchiveValidationStatus.VALIDATED,
        tags: ["CTR-2026-0001"],
        organizationId: org.id,
        uploadedById: logistica.id,
      },
      {
        title: "FUEC-2026-88421",
        category: ArchiveCategory.FUEC,
        docType: ArchiveDocType.FUEC,
        validationStatus: ArchiveValidationStatus.PENDING,
        tags: ["FUEC", "EN_RUTA"],
        vehicleId: bus001.id,
        organizationId: org.id,
        uploadedById: logistica.id,
      },
    ],
  });

  // ——— TI ———
  await prisma.systemAlert.createMany({
    data: [
      {
        severity: "WARN",
        source: "NOC",
        message: "Latencia Kafka topic trip.dispatched > 800ms",
        organizationId: org.id,
      },
      {
        severity: "INFO",
        source: "STTS",
        message: "Job síntesis voz Presidencia completado",
        resolved: true,
        resolvedAt: hoursFromNow(-4),
        organizationId: org.id,
      },
    ],
  });
  await prisma.systemLog.createMany({
    data: [
      {
        organizationId: org.id,
        level: SystemLogLevel.INFO,
        source: "api.auth",
        message: "Login node logistica@fsg.co OK",
      },
      {
        organizationId: org.id,
        level: SystemLogLevel.WARN,
        source: "event-mesh",
        message: "Retry uplink GPS BUS-001",
        correlationId: "corr-gps-001",
      },
    ],
  });
  await prisma.systemTicket.create({
    data: {
      title: "Rotar secrets Redis staging",
      detail: "Rotación trimestral de credenciales NOC",
      status: "OPEN",
      createdById: logistica.id,
    },
  });

  // ——— Escolar ———
  const family = await prisma.familyProfile.create({
    data: {
      name: "Familia Gómez",
      phone: "3009988776",
      customerId: custEscolar.id,
      organizationId: org.id,
    },
  });
  const dep1 = await prisma.dependent.create({
    data: { name: "Valentina Gómez", document: "1099001", familyId: family.id },
  });
  const dep2 = await prisma.dependent.create({
    data: { name: "Mateo Gómez", document: "1099002", familyId: family.id },
  });

  const student1 = await prisma.schoolStudent.create({
    data: {
      organizationId: org.id,
      name: "Valentina Gómez",
      document: "1099001",
      qrCode: "STU-QR-VAL-001",
      nfcUid: "NFC-VAL-001",
      schoolName: "Colegio Andino Norte",
      grade: "5°",
      currentStatus: StudentTripStatus.ABORDADO,
      dependentId: dep1.id,
      familyId: family.id,
    },
  });
  const student2 = await prisma.schoolStudent.create({
    data: {
      organizationId: org.id,
      name: "Mateo Gómez",
      document: "1099002",
      qrCode: "STU-QR-MAT-002",
      nfcUid: "NFC-MAT-002",
      schoolName: "Colegio Andino Norte",
      grade: "3°",
      currentStatus: StudentTripStatus.BUS_EN_CAMINO,
      dependentId: dep2.id,
      familyId: family.id,
    },
  });
  const student3 = await prisma.schoolStudent.create({
    data: {
      organizationId: org.id,
      name: "Laura Ruiz",
      document: "1099003",
      qrCode: "STU-QR-LAU-003",
      schoolName: "Colegio Andino Norte",
      grade: "6°",
      currentStatus: StudentTripStatus.PENDING,
    },
  });

  const schoolRoute = await prisma.schoolRoute.create({
    data: {
      organizationId: org.id,
      code: "ESC-R01",
      name: "Ruta Usaquén mañana",
      direction: SchoolRouteDirection.TO_SCHOOL,
      vehicleId: bus003.id,
      driverId: driverLucia.id,
      monitorId: monitor.id,
      lastLat: 4.6682,
      lastLng: -74.0531,
      lastLocatedAt: new Date(),
    },
  });
  const stop1 = await prisma.schoolStop.create({
    data: {
      schoolRouteId: schoolRoute.id,
      sequence: 1,
      name: "Calle 127 # 15",
      kind: SchoolStopKind.PICKUP,
      lat: 4.705,
      lng: -74.045,
    },
  });
  const stop2 = await prisma.schoolStop.create({
    data: {
      schoolRouteId: schoolRoute.id,
      sequence: 2,
      name: "Colegio Andino Norte",
      kind: SchoolStopKind.SCHOOL,
      lat: 4.6682,
      lng: -74.0531,
    },
  });
  await prisma.schoolStudentAssignment.createMany({
    data: [
      { schoolRouteId: schoolRoute.id, studentId: student1.id, stopId: stop1.id },
      { schoolRouteId: schoolRoute.id, studentId: student2.id, stopId: stop1.id },
      { schoolRouteId: schoolRoute.id, studentId: student3.id, stopId: stop1.id },
    ],
  });
  const run = await prisma.schoolRouteRun.create({
    data: {
      organizationId: org.id,
      schoolRouteId: schoolRoute.id,
      status: SchoolRouteRunStatus.IN_PROGRESS,
      monitorId: monitor.id,
      startedAt: hoursFromNow(-1),
      startLat: 4.705,
      startLng: -74.045,
    },
  });
  await prisma.schoolBoardingEvent.create({
    data: {
      organizationId: org.id,
      studentId: student1.id,
      schoolRouteId: schoolRoute.id,
      runId: run.id,
      kind: SchoolBoardingKind.BOARD,
      method: SchoolBoardingMethod.QR,
      resultingStatus: StudentTripStatus.ABORDADO,
      lat: 4.705,
      lng: -74.045,
      monitorUserId: monitoraUser.id,
    },
  });

  // ——— Pasajeros / B2B portal ———
  const passenger = await prisma.passengerProfile.create({
    data: {
      name: "Diego Pasajero Corp",
      phone: "3151112233",
      email: "diego.pasajero@ecopetrol.demo",
      document: "80155667",
      customerId: custB2b.id,
      organizationId: org.id,
    },
  });
  await prisma.boardingPass.create({
    data: {
      organizationId: org.id,
      passengerId: passenger.id,
      tripId: tripAssigned.id,
      token: `bp_${randomUUID().replace(/-/g, "")}`,
      qrPayload: `BOARD|${tripAssigned.code}|${passenger.document}`,
      status: BoardingPassStatus.ISSUED,
      expiresAt: hoursFromNow(8),
      seatLabel: "A12",
    },
  });
  await prisma.rideRequest.create({
    data: {
      passengerId: passenger.id,
      origin: "Calle 100",
      destination: "Aeropuerto El Dorado",
      status: "COMPLETED",
      rating: 5,
      npsComment: "Puntual y limpio",
    },
  });
  await prisma.b2bServiceRequest.createMany({
    data: [
      {
        organizationId: org.id,
        customerId: custB2b.id,
        contractId: contractB2b.id,
        kind: B2bServiceRequestKind.EXPRESS,
        status: B2bServiceRequestStatus.PENDING,
        origin: "Torre Ecopetrol",
        destination: "El Dorado T1",
        departAt: hoursFromNow(6),
        estimatedFare: 380000,
        notes: "Ejecutivo — prioridad alta",
      },
      {
        organizationId: org.id,
        customerId: custB2b.id,
        contractId: contractB2b.id,
        kind: B2bServiceRequestKind.RESCHEDULE,
        status: B2bServiceRequestStatus.APPROVED,
        origin: "Bogotá Norte",
        destination: "Barrancabermeja Refinería",
        departAt: hoursFromNow(48),
        estimatedFare: 1850000,
        tripId: tripPending.id,
        originalTripId: tripDone.id,
      },
    ],
  });

  await prisma.executiveQueryLog.create({
    data: {
      organizationId: org.id,
      userId: presidenci.id,
      utterance: "¿Cuántos viajes en tránsito hay hoy?",
      generatedSql: "SELECT count(*) FROM \"Trip\" WHERE status = 'IN_TRANSIT'",
      answerText: "1 viaje en tránsito (TRP-2026-0001).",
    },
  });

  await prisma.payrollLaborConfig.upsert({
    where: { organizationId: org.id },
    create: {
      organizationId: org.id,
      baseSalary: 1_423_500,
      monthlyHoursDivisor: 230,
      weeklyOrdinaryHours: 42,
    },
    update: {
      baseSalary: 1_423_500,
      monthlyHoursDivisor: 230,
      weeklyOrdinaryHours: 42,
    },
  });

  const vacFrom = new Date();
  vacFrom.setDate(1);
  vacFrom.setHours(0, 0, 0, 0);
  const vacTo = new Date(vacFrom);
  vacTo.setDate(5);
  vacTo.setHours(23, 59, 59, 999);
  await prisma.driverNovelty.create({
    data: {
      organizationId: org.id,
      driverId: driverPedro.id,
      kind: DriverNoveltyKind.VACATION_PAID,
      dateFrom: vacFrom,
      dateTo: vacTo,
      notes: "Demo vacaciones — seed logística",
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: org.id,
      action: "SEED_DEMO",
      entity: "Organization",
      entityId: org.id,
      module: FleetModule.TECNOLOGIA,
      meta: {
        vehicles: 4,
        trips: 5,
        customers: 4,
        contracts: 4,
        tickets: 3,
        schoolStudents: 3,
      },
      userId: presidenci.id,
    },
  });

  // Conteos finales
  const counts = {
    customers: await prisma.customer.count(),
    contracts: await prisma.transportContract.count(),
    trips: await prisma.trip.count(),
    vehicles: await prisma.vehicle.count(),
    drivers: await prisma.driver.count(),
    invoices: await prisma.invoice.count(),
    tickets: await prisma.ticket.count(),
    workOrders: await prisma.workOrder.count(),
    schoolStudents: await prisma.schoolStudent.count(),
    boardingPasses: await prisma.boardingPass.count(),
    b2bRequests: await prisma.b2bServiceRequest.count(),
    hqseIncidents: await prisma.hqseIncident.count(),
  };

  console.log("[seed] Usuarios (password: fsg2026):");
  console.log("  - presidencia@fsg.co | logistica@fsg.co | revisoria@fsg.co");
  console.log("  - conductor@fsg.co | monitora@fsg.co");
  console.log("[seed] Conteos:", counts);
  console.log("[seed] OK — refresca la web (logistica@fsg.co) para ver datos");
}

main()
  .catch((e) => {
    console.error("[seed] ERROR", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
