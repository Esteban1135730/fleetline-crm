import { ArchiveDocType, ArchiveEntityType, ArchiveValidationStatus } from "@fsg/db";
import { extractDocumentMetadata } from "./ocr-extract";
import { OcrIngestionService } from "./ocr-ingestion.service";
import { DataRoomService } from "./data-room.service";

describe("extractDocumentMetadata — SOAT OCR mock", () => {
  it("extrae fecha de vencimiento y placa de un SOAT simulado", () => {
    const raw = [
      "SOAT SEGURO OBLIGATORIO DE ACCIDENTES DE TRANSITO",
      "PLACA: BOG-892",
      "NIT TOMADOR: 900123456-1",
      "ASEGURADORA: Seguros Bolivar",
      "VIGENCIA DESDE: 2026-03-15",
      "VENCE: 2027-03-15",
      "PRIMA: 450000",
    ].join("\n");

    const out = extractDocumentMetadata({ rawText: raw });
    expect(out.docType).toBe(ArchiveDocType.SOAT);
    expect(out.plate).toBe("BOG-892");
    expect(out.expiresAt).toBe("2027-03-15");
    expect(out.issuedAt).toBe("2026-03-15");
    expect(out.issuer).toMatch(/Bolivar/i);
    expect(out.amount).toBe(450000);
  });
});

describe("OcrIngestionService — document.processed → Trámites", () => {
  it("persiste metadatos SOAT y emite document.processed", async () => {
    const kafka = {
      emitDocumentProcessed: jest.fn().mockResolvedValue(undefined),
    };
    const update = jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "doc-1",
        ...data,
        contentHash: "abc",
        fileRef: "/uploads/soat.pdf",
        supplierId: null,
        purchaseOrderId: null,
      }),
    );

    const prisma = {
      archiveDocument: {
        findFirst: jest.fn().mockResolvedValue({
          id: "doc-1",
          title: "SOAT BOG-892",
          docType: ArchiveDocType.OTHER,
          vehicleId: "veh-1",
          driverId: null,
          supplierId: null,
          purchaseOrderId: null,
          entityType: ArchiveEntityType.VEHICLE,
          entityId: "veh-1",
          originalName: "soat-bog892.pdf",
          fileRef: "/uploads/soat.pdf",
          contentHash: "abc",
        }),
        update,
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: "veh-1",
          plate: "BOG-892",
        }),
      },
      driver: { findFirst: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const svc = new OcrIngestionService(prisma as never, kafka as never);
    const out = await svc.processDocument("org-1", "doc-1", {
      rawText: [
        "SOAT",
        "PLACA: BOG-892",
        "VENCE: 2027-03-15",
        "ASEGURADORA: Seguros XYZ",
        "PRIMA: 100000",
      ].join("\n"),
    });

    expect(out.extracted.expiresAt).toBe("2027-03-15");
    expect(out.extracted.docType).toBe(ArchiveDocType.SOAT);
    expect(kafka.emitDocumentProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        archiveDocumentId: "doc-1",
        docType: ArchiveDocType.SOAT,
        vehicleId: "veh-1",
        plate: "BOG-892",
        expiresAt: expect.stringContaining("2027-03-15"),
      }),
    );
    expect(out.event).toBe("document.processed");
  });
});

describe("DataRoomService — expediente por entidad", () => {
  it("agrupa documentos del Data Room de un vehículo", async () => {
    const docs = [
      {
        id: "d1",
        docType: ArchiveDocType.SOAT,
        title: "SOAT 2027",
        validationStatus: ArchiveValidationStatus.VALIDATED,
      },
      {
        id: "d2",
        docType: ArchiveDocType.TECNOMECANICA,
        title: "RTM",
        validationStatus: ArchiveValidationStatus.PENDING,
      },
    ];

    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          id: "veh-1",
          plate: "BOG-892",
          brand: "Mercedes",
          model: "Sprinter",
          status: "AVAILABLE",
          complianceBlocked: false,
        }),
      },
      archiveDocument: {
        findMany: jest.fn().mockResolvedValue(docs),
      },
    };

    const svc = new DataRoomService(prisma as never, {} as never);
    const room = await svc.dataRoom("org-1", "VEHICLE", "veh-1");

    expect(room.dataRoom).toBe(true);
    expect(room.entityType).toBe(ArchiveEntityType.VEHICLE);
    expect(room.count).toBe(2);
    expect(room.byType.SOAT).toHaveLength(1);
    expect(room.byType.TECNOMECANICA).toHaveLength(1);
    expect(room.entity).toMatchObject({ plate: "BOG-892" });
  });
});
