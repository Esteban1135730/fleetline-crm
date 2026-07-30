import {
  PrismaClient,
  Role,
  CustomerSegment,
  TripStatus,
  VehicleStatus,
  WorkOrderStatus,
  InvoiceType,
  InvoiceStatus,
  JournalEntryStatus,
  EmployeeStatus,
  TicketChannel,
  TicketStatus,
  DocStatus,
  SarlaftRisk,
  ArchiveCategory,
  QuoteStatus,
  AccountType,
  CommercialChannel,
  ContractStatus,
  PurchaseStatus,
  ProcedureType,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.account.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.parkingLog.deleteMany();
  await prisma.vehicleProcedure.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.transportContract.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.sarlaftCheck.deleteMany();
  await prisma.fuecDocument.deleteMany();
  await prisma.qualityEvent.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.archiveDocument.deleteMany();
  await prisma.visitor.deleteMany();
  await prisma.systemAlert.deleteMany();
  await prisma.forensicFinding.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "FSG Transportes S.A.S.", nit: "900123456-1" },
  });

  const passwordHash = await bcrypt.hash("fsg2026", 10);
  const users = [
    { email: "ceo@fsg.co", name: "Ana CEO", role: Role.PRESIDENCIA },
    { email: "ops@fsg.co", name: "Carlos Ops", role: Role.GERENCIA },
    { email: "fin@fsg.co", name: "María Finanzas", role: Role.FINANZAS },
    { email: "despacho@fsg.co", name: "Luis Despacho", role: Role.DESPACHO },
    {
      email: "conductor@fsg.co",
      name: "Luis Pérez (Conductor)",
      role: Role.DESPACHO,
    },
    { email: "rrhh@fsg.co", name: "Sofía RRHH", role: Role.RRHH },
    { email: "atencion@fsg.co", name: "Pedro Atención", role: Role.ATENCION },
    { email: "ti@fsg.co", name: "Diana Sistemas", role: Role.SISTEMAS },
  ];
  for (const u of users) {
    await prisma.user.create({
      data: { ...u, email: u.email.toLowerCase(), passwordHash, organizationId: org.id },
    });
  }

  const conductorUser = await prisma.user.findUniqueOrThrow({
    where: { email: "conductor@fsg.co" },
  });

  const customers = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Ecopetrol S.A.",
        nit: "899999068-1",
        email: "movilidad@ecopetrol.com.co",
        phone: "6012345678",
        segment: CustomerSegment.B2B,
        organizationId: org.id,
      },
    }),
    prisma.customer.create({
      data: {
        name: "Colegio San Jorge",
        nit: "860012345-6",
        email: "transporte@sanjorge.edu.co",
        segment: CustomerSegment.ESCOLAR,
        organizationId: org.id,
      },
    }),
    prisma.customer.create({
      data: {
        name: "Turismo Andes",
        nit: "901234567-8",
        email: "ops@turismoandes.co",
        segment: CustomerSegment.TURISMO,
        organizationId: org.id,
      },
    }),
  ]);

  await prisma.quote.createMany({
    data: [
      {
        code: "COT-2026-001",
        customerId: customers[0].id,
        amount: 85000000,
        status: QuoteStatus.APPROVED,
        notes: "Ruta corporativa sede norte",
      },
      {
        code: "COT-2026-002",
        customerId: customers[1].id,
        amount: 42000000,
        status: QuoteStatus.SENT,
        notes: "Ruta escolar AM/PM",
      },
    ],
  });

  const vehicles = await Promise.all([
    prisma.vehicle.create({
      data: {
        plate: "ABC-123",
        brand: "Mercedes",
        model: "Sprinter",
        year: 2022,
        capacity: 19,
        status: VehicleStatus.IN_SERVICE,
        lat: 4.711,
        lng: -74.0721,
        organizationId: org.id,
      },
    }),
    prisma.vehicle.create({
      data: {
        plate: "DEF-456",
        brand: "Chevrolet",
        model: "NPR",
        year: 2021,
        capacity: 30,
        status: VehicleStatus.AVAILABLE,
        lat: 4.668,
        lng: -74.054,
        organizationId: org.id,
      },
    }),
    prisma.vehicle.create({
      data: {
        plate: "GHI-789",
        brand: "Hyundai",
        model: "County",
        year: 2020,
        capacity: 28,
        status: VehicleStatus.MAINTENANCE,
        lat: 4.65,
        lng: -74.1,
        organizationId: org.id,
      },
    }),
    prisma.vehicle.create({
      data: {
        plate: "JKL-012",
        brand: "Toyota",
        model: "Hiace",
        year: 2023,
        capacity: 15,
        status: VehicleStatus.IN_SERVICE,
        lat: 4.73,
        lng: -74.05,
        organizationId: org.id,
      },
    }),
  ]);

  const drivers = await Promise.all([
    prisma.driver.create({
      data: {
        name: "Luis Pérez",
        document: "1012345678",
        phone: "3001112233",
        license: "C2-9988",
        userId: conductorUser.id,
        organizationId: org.id,
      },
    }),
    prisma.driver.create({
      data: {
        name: "Pedro Gómez",
        document: "1023456789",
        phone: "3002223344",
        license: "C2-8877",
        organizationId: org.id,
      },
    }),
  ]);

  const contracts = await Promise.all([
    prisma.transportContract.create({
      data: {
        code: "CTR-2026-001",
        name: "Movilidad corporativa Ecopetrol",
        channel: CommercialChannel.PRIVATE,
        status: ContractStatus.ACTIVE,
        route: "Bogotá Norte - Sede Norte",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        monthlyValue: 85000000,
        customerId: customers[0].id,
        organizationId: org.id,
      },
    }),
    prisma.transportContract.create({
      data: {
        code: "CTR-2026-002",
        name: "Ruta escolar contrato 2026",
        channel: CommercialChannel.PRIVATE,
        status: ContractStatus.ACTIVE,
        route: "Colegio San Jorge — AM/PM",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        monthlyValue: 42000000,
        customerId: customers[1].id,
        organizationId: org.id,
      },
    }),
    prisma.transportContract.create({
      data: {
        code: "CTR-2026-003",
        name: "Licitación turismo institucional",
        channel: CommercialChannel.PUBLIC_TENDER,
        status: ContractStatus.ACTIVE,
        route: "Turismo Andes — rutas regionales",
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-08-31"),
        monthlyValue: 35000000,
        customerId: customers[2].id,
        organizationId: org.id,
      },
    }),
  ]);

  await prisma.trip.createMany({
    data: [
      {
        code: "TRP-1001",
        origin: "Bogotá Norte",
        destination: "Ecopetrol Sede Norte",
        status: TripStatus.IN_TRANSIT,
        scheduledAt: new Date(),
        startedAt: new Date(),
        fareAmount: 850000,
        customerId: customers[0].id,
        contractId: contracts[0].id,
        vehicleId: vehicles[0].id,
        driverId: drivers[0].id,
        organizationId: org.id,
      },
      {
        code: "TRP-1002",
        origin: "Colegio San Jorge",
        destination: "Calle 140",
        status: TripStatus.ASSIGNED,
        scheduledAt: new Date(Date.now() + 3600000),
        fareAmount: 420000,
        customerId: customers[1].id,
        contractId: contracts[1].id,
        vehicleId: vehicles[3].id,
        driverId: drivers[1].id,
        organizationId: org.id,
      },
      {
        code: "TRP-1003",
        origin: "Terminal Salitre",
        destination: "Villa de Leyva",
        status: TripStatus.PENDING,
        scheduledAt: new Date(Date.now() + 86400000),
        fareAmount: 2500000,
        customerId: customers[2].id,
        contractId: contracts[2].id,
        organizationId: org.id,
      },
      {
        code: "TRP-1004",
        origin: "Ruta Norte",
        destination: "Chía",
        status: TripStatus.INCIDENT,
        scheduledAt: new Date(),
        startedAt: new Date(),
        fareAmount: 600000,
        customerId: customers[0].id,
        contractId: contracts[0].id,
        vehicleId: vehicles[1].id,
        organizationId: org.id,
        notes: "Tráfico lento Invías",
      },
      {
        code: "TRP-1005",
        origin: "Usaquén",
        destination: "Aeropuerto",
        status: TripStatus.COMPLETED,
        scheduledAt: new Date(Date.now() - 2 * 86400000),
        startedAt: new Date(Date.now() - 2 * 86400000),
        completedAt: new Date(Date.now() - 2 * 86400000 + 7200000),
        fareAmount: 380000,
        customerId: customers[0].id,
        contractId: contracts[0].id,
        vehicleId: vehicles[0].id,
        driverId: drivers[0].id,
        organizationId: org.id,
      },
    ],
  });

  await prisma.workOrder.createMany({
    data: [
      {
        code: "OT-501",
        description: "Cambio de pastillas de freno",
        status: WorkOrderStatus.IN_PROGRESS,
        vehicleId: vehicles[2].id,
        cost: 1200000,
      },
      {
        code: "OT-502",
        description: "Revisión preventiva 10.000 km",
        status: WorkOrderStatus.OPEN,
        vehicleId: vehicles[1].id,
        cost: 800000,
      },
    ],
  });

  await prisma.invoice.createMany({
    data: [
      {
        number: "FV-2026-001",
        type: InvoiceType.RECEIVABLE,
        status: InvoiceStatus.ISSUED,
        amount: 45000000,
        dueDate: new Date(Date.now() + 15 * 86400000),
        issuedAt: new Date(),
        customerId: customers[0].id,
        organizationId: org.id,
        description: "Servicio corporativo junio",
      },
      {
        number: "FV-2026-002",
        type: InvoiceType.RECEIVABLE,
        status: InvoiceStatus.PAID,
        amount: 28000000,
        dueDate: new Date(Date.now() - 5 * 86400000),
        issuedAt: new Date(Date.now() - 10 * 86400000),
        paidAt: new Date(),
        customerId: customers[1].id,
        organizationId: org.id,
        description: "Ruta escolar mayo",
      },
      {
        number: "FC-2026-010",
        type: InvoiceType.PAYABLE,
        status: InvoiceStatus.OVERDUE,
        amount: 8500000,
        dueDate: new Date(Date.now() - 3 * 86400000),
        issuedAt: new Date(Date.now() - 20 * 86400000),
        supplierName: "Repuestos Andinos SAS",
        organizationId: org.id,
        description: "Repuestos taller",
      },
      {
        number: "FC-2026-011",
        type: InvoiceType.PAYABLE,
        status: InvoiceStatus.ISSUED,
        amount: 15000000,
        dueDate: new Date(Date.now() + 10 * 86400000),
        issuedAt: new Date(),
        supplierName: "Combustibles del Norte",
        organizationId: org.id,
        description: "Combustible flota",
      },
      // Histórico 6 meses para gráficos
      ...[5, 4, 3, 2, 1, 0].flatMap((monthsAgo, idx) => {
        const issuedAt = new Date();
        issuedAt.setMonth(issuedAt.getMonth() - monthsAgo);
        issuedAt.setDate(8 + idx);
        const base = 18_000_000 + idx * 4_000_000;
        return [
          {
            number: `FV-HIST-${String(idx + 1).padStart(2, "0")}A`,
            type: InvoiceType.RECEIVABLE,
            status: InvoiceStatus.PAID,
            amount: base,
            dueDate: new Date(issuedAt.getTime() + 15 * 86400000),
            issuedAt,
            paidAt: new Date(issuedAt.getTime() + 10 * 86400000),
            customerId: customers[idx % 3].id,
            organizationId: org.id,
            description: `Facturación histórica mes -${monthsAgo}`,
          },
          {
            number: `FC-HIST-${String(idx + 1).padStart(2, "0")}B`,
            type: InvoiceType.PAYABLE,
            status: InvoiceStatus.PAID,
            amount: Math.round(base * 0.35),
            dueDate: new Date(issuedAt.getTime() + 10 * 86400000),
            issuedAt,
            paidAt: new Date(issuedAt.getTime() + 8 * 86400000),
            supplierName: "Operación flota",
            organizationId: org.id,
            description: `Gastos históricos mes -${monthsAgo}`,
          },
        ];
      }),
    ],
  });

  const accounts = await Promise.all([
    prisma.account.create({
      data: {
        code: "1105",
        name: "Caja",
        type: AccountType.ASSET,
        organizationId: org.id,
      },
    }),
    prisma.account.create({
      data: {
        code: "1110",
        name: "Bancos",
        type: AccountType.ASSET,
        organizationId: org.id,
      },
    }),
    prisma.account.create({
      data: {
        code: "1305",
        name: "Clientes",
        type: AccountType.ASSET,
        organizationId: org.id,
      },
    }),
    prisma.account.create({
      data: {
        code: "2205",
        name: "Proveedores",
        type: AccountType.LIABILITY,
        organizationId: org.id,
      },
    }),
    prisma.account.create({
      data: {
        code: "4135",
        name: "Ingresos por transporte",
        type: AccountType.INCOME,
        organizationId: org.id,
      },
    }),
    prisma.account.create({
      data: {
        code: "5105",
        name: "Gastos de personal",
        type: AccountType.EXPENSE,
        organizationId: org.id,
      },
    }),
    prisma.account.create({
      data: {
        code: "5135",
        name: "Combustibles y lubricantes",
        type: AccountType.EXPENSE,
        organizationId: org.id,
      },
    }),
  ]);

  await prisma.journalEntry.create({
    data: {
      number: "AS-2026-001",
      description: "Facturación servicio Ecopetrol",
      status: JournalEntryStatus.POSTED,
      organizationId: org.id,
      lines: {
        create: [
          { accountId: accounts[2].id, debit: 45000000, credit: 0, memo: "CxC" },
          { accountId: accounts[4].id, debit: 0, credit: 45000000, memo: "Ingreso" },
        ],
      },
    },
  });

  await prisma.employee.createMany({
    data: [
      {
        name: "Luis Pérez",
        document: "1012345678",
        position: "Conductor",
        area: "Operaciones",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 22,
        organizationId: org.id,
        phone: "3001112233",
      },
      {
        name: "Pedro Gómez",
        document: "1023456789",
        position: "Conductor",
        area: "Operaciones",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 41,
        organizationId: org.id,
      },
      {
        name: "Camila Ruiz",
        document: "1034567890",
        position: "Monitora",
        area: "Operaciones",
        status: EmployeeStatus.VACATION,
        fatigueScore: 5,
        organizationId: org.id,
      },
      {
        name: "Laura Martínez",
        document: "1045678901",
        position: "Agente call center",
        area: "Call Center",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 12,
        organizationId: org.id,
      },
      {
        name: "Andrea López",
        document: "1056789012",
        position: "Auxiliar archivo",
        area: "Archivo",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 8,
        organizationId: org.id,
      },
      {
        name: "Carlos Mejía",
        document: "1067890123",
        position: "Auxiliar contable",
        area: "Tesorería",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 15,
        organizationId: org.id,
      },
      {
        name: "Diana Ortiz",
        document: "1078901234",
        position: "Ingeniera HSQE",
        area: "HSQE / Calidad",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 10,
        organizationId: org.id,
      },
      {
        name: "Jorge Ramírez",
        document: "1089012345",
        position: "Abogado",
        area: "Jurídico",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 6,
        organizationId: org.id,
      },
      {
        name: "María Soto",
        document: "1090123456",
        position: "Compradora",
        area: "Compras",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 14,
        organizationId: org.id,
      },
      {
        name: "Felipe Castro",
        document: "1101234567",
        position: "Analista RRHH",
        area: "Recursos Humanos",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 9,
        organizationId: org.id,
      },
      {
        name: "Sandra Vargas",
        document: "1112345678",
        position: "Ejecutiva comercial",
        area: "Comercial",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 18,
        organizationId: org.id,
      },
      {
        name: "Ricardo Peña",
        document: "1123456789",
        position: "Gestor trámites",
        area: "Trámites",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 11,
        organizationId: org.id,
      },
      {
        name: "Héctor Díaz",
        document: "1134567890",
        position: "Guarda parqueadero",
        area: "Parqueadero",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 20,
        organizationId: org.id,
      },
      {
        name: "Miguel Ángel Rojas",
        document: "1145678901",
        position: "Mecánico",
        area: "Taller",
        status: EmployeeStatus.ACTIVE,
        fatigueScore: 25,
        organizationId: org.id,
      },
    ],
  });

  await prisma.ticket.createMany({
    data: [
      {
        code: "TK-1001",
        subject: "Retraso ruta sede norte",
        channel: TicketChannel.WHATSAPP,
        status: TicketStatus.OPEN,
        requester: "Carlos Cliente",
        message: "El vehículo lleva 20 min de retraso",
        organizationId: org.id,
      },
      {
        code: "TK-1002",
        subject: "Solicitud factura junio",
        channel: TicketChannel.EMAIL,
        status: TicketStatus.IN_PROGRESS,
        requester: "Contabilidad Ecopetrol",
        message: "Necesitamos PDF de FV-2026-001",
        organizationId: org.id,
      },
    ],
  });

  await prisma.qualityEvent.createMany({
    data: [
      {
        type: "NPS",
        title: "Encuesta post-viaje B2B",
        score: 5,
        status: "CLOSED",
        organizationId: org.id,
        createdAt: new Date(Date.now() - 5 * 86400000),
      },
      {
        type: "NPS",
        title: "Encuesta ruta escolar",
        score: 4,
        status: "CLOSED",
        organizationId: org.id,
        createdAt: new Date(Date.now() - 12 * 86400000),
      },
      {
        type: "NPS",
        title: "Encuesta turismo",
        score: 4.5,
        status: "CLOSED",
        organizationId: org.id,
        createdAt: new Date(Date.now() - 40 * 86400000),
      },
      {
        type: "NPS",
        title: "Encuesta corporativa",
        score: 4.8,
        status: "CLOSED",
        organizationId: org.id,
        createdAt: new Date(Date.now() - 70 * 86400000),
      },
      {
        type: "NPS",
        title: "Encuesta Q1",
        score: 4.2,
        status: "CLOSED",
        organizationId: org.id,
        createdAt: new Date(Date.now() - 100 * 86400000),
      },
      {
        type: "NPS",
        title: "Encuesta Q0",
        score: 3.9,
        status: "CLOSED",
        organizationId: org.id,
        createdAt: new Date(Date.now() - 130 * 86400000),
      },
      {
        type: "INCIDENT",
        title: "Casi atropello en parada",
        description: "Reporte monitora — revisión QHSE",
        status: "OPEN",
        organizationId: org.id,
      },
    ],
  });

  await prisma.fuecDocument.createMany({
    data: [
      {
        number: "FUEC-2026-001",
        contractor: "Ecopetrol S.A.",
        route: "Bogotá Norte - Sede Norte",
        status: DocStatus.VALID,
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-12-31"),
        vehicleId: vehicles[0].id,
        organizationId: org.id,
      },
      {
        number: "FUEC-2026-002",
        contractor: "Colegio San Jorge",
        route: "Ruta escolar #5",
        status: DocStatus.EXPIRING,
        validFrom: new Date("2026-01-01"),
        validTo: new Date(Date.now() + 20 * 86400000),
        vehicleId: vehicles[3].id,
        organizationId: org.id,
      },
    ],
  });

  await prisma.sarlaftCheck.createMany({
    data: [
      {
        subjectName: "Ecopetrol S.A.",
        subjectDoc: "899999068-1",
        risk: SarlaftRisk.LOW,
        notes: "Cliente habitual — sin hallazgos",
        customerId: customers[0].id,
        organizationId: org.id,
      },
      {
        subjectName: "Proveedor Repuestos Andinos",
        subjectDoc: "900888777-2",
        risk: SarlaftRisk.MEDIUM,
        notes: "Revisar listas restrictivas trimestral",
        organizationId: org.id,
      },
    ],
  });

  await prisma.archiveDocument.createMany({
    data: [
      {
        title: "Contrato marco Ecopetrol 2026",
        category: ArchiveCategory.CONTRACT,
        fileRef: "contracts/ecopetrol-2026.pdf",
        tags: "b2b,marco",
        organizationId: org.id,
      },
      {
        title: "Póliza RCE flota",
        category: ArchiveCategory.LEGAL,
        fileRef: "legal/poliza-rce.pdf",
        tags: "seguro",
        organizationId: org.id,
      },
    ],
  });

  await prisma.visitor.createMany({
    data: [
      {
        name: "Andrea López",
        document: "52999888",
        company: "Invías",
        purpose: "Reunión operaciones",
        hostName: "Carlos Ops",
        organizationId: org.id,
      },
      {
        name: "Jorge Méndez",
        document: "80111222",
        company: "Proveedor GPS",
        purpose: "Instalación equipos",
        hostName: "Diana Sistemas",
        checkedOutAt: new Date(),
        organizationId: org.id,
      },
    ],
  });

  await prisma.systemAlert.createMany({
    data: [
      {
        severity: "WARN",
        source: "Trámites",
        message: "Hay documentos de flota por vencer o vencidos — revisar módulo Trámites",
        organizationId: org.id,
      },
      {
        severity: "INFO",
        source: "Operaciones",
        message: "Seed inicial cargado: flota, contratos y personal por área",
        resolved: true,
        organizationId: org.id,
      },
    ],
  });

  await prisma.forensicFinding.createMany({
    data: [
      {
        code: "RF-001",
        title: "Doble pago combustible",
        severity: "HIGH",
        status: "OPEN",
        detail: "Facturas FC-2026-011 y FC-2025-990 con mismo periodo",
        amount: 15000000,
        organizationId: org.id,
      },
      {
        code: "RF-002",
        title: "Viaje sin FUEC vinculado",
        severity: "MEDIUM",
        status: "OPEN",
        detail: "TRP-1003 pendiente de documento",
        organizationId: org.id,
      },
    ],
  });

  await prisma.purchaseOrder.createMany({
    data: [
      {
        code: "OC-0001",
        description: "Filtros de aceite y aire — lote flota",
        supplier: "Repuestos Andinos SAS",
        amount: 2800000,
        category: "REPUESTOS",
        status: PurchaseStatus.APPROVED,
        requestedBy: "María Soto",
        organizationId: org.id,
      },
      {
        code: "OC-0002",
        description: "Combustible diesel — quincena",
        supplier: "Combustibles del Norte",
        amount: 18500000,
        category: "COMBUSTIBLE",
        status: PurchaseStatus.ORDERED,
        requestedBy: "Carlos Mejía",
        organizationId: org.id,
      },
      {
        code: "OC-0003",
        description: "Papelería archivo y call center",
        supplier: "Papelería Central",
        amount: 450000,
        category: "PAPELERIA",
        status: PurchaseStatus.RECEIVED,
        requestedBy: "Andrea López",
        organizationId: org.id,
      },
    ],
  });

  await prisma.vehicleProcedure.createMany({
    data: [
      {
        type: ProcedureType.SOAT,
        reference: "POL-2026-ABC123",
        status: DocStatus.VALID,
        validFrom: new Date("2026-01-15"),
        validTo: new Date("2027-01-15"),
        vehicleId: vehicles[0].id,
        organizationId: org.id,
      },
      {
        type: ProcedureType.TECNOMECANICA,
        reference: "RTM-884422",
        status: DocStatus.EXPIRING,
        validFrom: new Date("2025-08-01"),
        validTo: new Date(Date.now() + 18 * 86400000),
        vehicleId: vehicles[1].id,
        organizationId: org.id,
      },
      {
        type: ProcedureType.TARJETA_OPERACION,
        reference: "TO-2026-789",
        status: DocStatus.VALID,
        validTo: new Date("2026-12-31"),
        vehicleId: vehicles[3].id,
        organizationId: org.id,
      },
      {
        type: ProcedureType.SOAT,
        reference: "POL-2025-GHI789",
        status: DocStatus.EXPIRED,
        validTo: new Date(Date.now() - 12 * 86400000),
        vehicleId: vehicles[2].id,
        organizationId: org.id,
        notes: "Vehículo en taller — renovación pendiente",
      },
    ],
  });

  await prisma.parkingLog.createMany({
    data: [
      {
        plate: vehicles[1].plate,
        driverName: "Pedro Gómez",
        guardName: "Héctor Díaz",
        vehicleId: vehicles[1].id,
        organizationId: org.id,
      },
      {
        plate: vehicles[2].plate,
        driverName: "—",
        guardName: "Héctor Díaz",
        vehicleId: vehicles[2].id,
        organizationId: org.id,
      },
      {
        plate: "MNO-345",
        driverName: "Visitante proveedor",
        guardName: "Héctor Díaz",
        checkOutAt: new Date(Date.now() - 3600000),
        organizationId: org.id,
      },
    ],
  });

  console.log(
    "Seed OK — usuarios: ceo / ops / fin / despacho / conductor / rrhh / atencion / ti @fsg.co — password: fsg2026",
  );
  console.log(
    "App conductor: conductor@fsg.co → Luis Pérez (TRP-1001 IN_TRANSIT)",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
