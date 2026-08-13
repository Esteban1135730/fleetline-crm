import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import {
  ArchiveCategory,
  ArchiveDocType,
  ArchiveEntityType,
  ArchiveValidationStatus,
  ComplianceDocType,
  DocStatus,
  VehicleStatus,
} from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import { RuntClient } from "../tramites/runt.client";
import type {
  BackgroundCheckDto,
  PortalLinkDto,
  ValidarOcrDto,
} from "./dto/vinculaciones.dto";
import {
  diagnoseBackgroundRisk,
  expiryAlertLevel,
  legalBlockVehiclePatch,
  mockSimitLookup,
  shouldBlockVehicleOnToExpiry,
} from "./dto/vinculaciones.dto";

/**
 * Módulo 13 — Smart Onboarding / Vinculaciones (Laura).
 */
@Injectable()
export class VinculacionesService {
  private readonly logger = new Logger(VinculacionesService.name);

  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
    private runt: RuntClient,
  ) {}

  /**
   * Link de auto-servicio para propietario (OCR + docs).
   */
  async createPortalLink(
    organizationId: string,
    createdById: string,
    dto: PortalLinkDto,
  ) {
    const count = await this.prisma.affiliateOnboarding.count({
      where: { organizationId },
    });
    const code = `AFF-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

    const onboarding = await this.prisma.affiliateOnboarding.create({
      data: {
        organizationId,
        code,
        stage: "RECEIVED",
        ownerName: dto.ownerName,
        ownerDocument: dto.ownerDocument,
        ownerEmail: dto.ownerEmail,
        ownerPhone: dto.ownerPhone,
        plate: dto.plate?.toUpperCase(),
        assignedToId: createdById,
      },
    });

    const token = randomBytes(24).toString("hex");
    const ttlHours = dto.ttlHours ?? 72;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const link = await this.prisma.affiliatePortalLink.create({
      data: {
        organizationId,
        onboardingId: onboarding.id,
        token,
        ownerEmail: dto.ownerEmail,
        ownerName: dto.ownerName,
        expiresAt,
        createdById,
        meta: { code, plate: dto.plate },
      },
    });

    const portalUrl = `/vinculaciones/portal/${token}`;

    await this.kafka.emit("vinculaciones.portal.link_created", {
      organizationId,
      onboardingId: onboarding.id,
      token,
      ownerEmail: dto.ownerEmail,
    });

    return {
      onboarding,
      link: {
        id: link.id,
        token,
        portalUrl,
        expiresAt,
      },
      message: `Portal auto-servicio generado (${code}) · vigencia ${ttlHours}h`,
    };
  }

  /**
   * Background check SIMIT + RUNT por cédula.
   */
  async backgroundCheck(
    organizationId: string,
    checkedById: string,
    dto: BackgroundCheckDto,
  ) {
    const simit = mockSimitLookup(dto.document);
    const runt = await this.runt.lookupLicenseByDocument(dto.document);

    const diagnosis = diagnoseBackgroundRisk({
      simitFinesCount: simit.finesCount,
      simitTotalCop: simit.totalCop,
      runtLicenseValid: runt.validInGovDb,
      runtLicenseExpiresAt: runt.expiresAt,
    });

    const check = await this.prisma.driverBackgroundCheck.create({
      data: {
        organizationId,
        document: dto.document,
        driverId: dto.driverId,
        driverName: dto.driverName,
        riskLight: diagnosis.riskLight,
        simitFinesCount: simit.finesCount,
        simitTotalCop: simit.totalCop,
        runtLicenseValid: runt.validInGovDb,
        runtLicenseExpiresAt: runt.expiresAt,
        diagnosis: diagnosis.diagnosis,
        rawPayload: {
          simit: simit.raw,
          runt: runt.raw,
          source: runt.source,
        } as object,
        checkedById,
      },
    });

    if (dto.driverId && diagnosis.riskLight === "RED") {
      await this.prisma.driver.update({
        where: { id: dto.driverId },
        data: {
          dispatchBlocked: true,
          blockReason: `BACKGROUND_CHECK_RED: ${diagnosis.diagnosis}`,
        },
      });
    }

    await this.kafka.emit("vinculaciones.background_check.done", {
      organizationId,
      checkId: check.id,
      document: dto.document,
      riskLight: diagnosis.riskLight,
    });

    return {
      check,
      simit: { finesCount: simit.finesCount, totalCop: simit.totalCop },
      runt: {
        valid: runt.validInGovDb,
        licenseNumber: runt.licenseNumber,
        expiresAt: runt.expiresAt,
        source: runt.source,
      },
      message: `Diagnóstico ${diagnosis.riskLight}: ${diagnosis.diagnosis}`,
    };
  }

  /**
   * Ingesta OCR → ComplianceDocument + contrato PDF ref + avance de pipeline.
   */
  async validarOcr(
    organizationId: string,
    actorId: string,
    dto: ValidarOcrDto,
  ) {
    const extracted = {
      plate: dto.extracted?.plate || dto.plate,
      reference: dto.extracted?.reference,
      issuedAt: dto.extracted?.issuedAt
        ? new Date(dto.extracted.issuedAt)
        : undefined,
      expiresAt: dto.extracted?.expiresAt
        ? new Date(dto.extracted.expiresAt)
        : this.heuristicExpiryFromText(dto.rawText),
      ownerName: dto.extracted?.ownerName,
      ownerDocument: dto.extracted?.ownerDocument,
    };

    if (dto.rawText && !extracted.plate) {
      const plateMatch = dto.rawText.match(
        /\b([A-Z]{3}\s*-?\s*\d{3,4})\b/i,
      );
      if (plateMatch) extracted.plate = plateMatch[1].replace(/\s/g, "").toUpperCase();
    }

    let onboarding = dto.onboardingId
      ? await this.prisma.affiliateOnboarding.findFirst({
          where: { id: dto.onboardingId, organizationId },
        })
      : null;

    let vehicle = dto.vehicleId
      ? await this.prisma.vehicle.findFirst({
          where: { id: dto.vehicleId, organizationId },
        })
      : extracted.plate
        ? await this.prisma.vehicle.findFirst({
            where: {
              organizationId,
              plate: extracted.plate.toUpperCase(),
            },
          })
        : null;

    const typeMap: Record<string, ComplianceDocType> = {
      TARJETA_PROPIEDAD: ComplianceDocType.TARJETA_PROPIEDAD,
      SOAT: ComplianceDocType.SOAT,
      TECNOMECANICA: ComplianceDocType.TECNOMECANICA,
      TARJETA_OPERACION: ComplianceDocType.TARJETA_OPERACION,
      POLIZA_CONTRACTUAL: ComplianceDocType.POLIZA_CONTRACTUAL,
      RCC: ComplianceDocType.RCC,
      RCE: ComplianceDocType.RCE,
      PERITAJE: ComplianceDocType.PERITAJE,
    };
    const docType = typeMap[dto.docType || "TARJETA_PROPIEDAD"];

    const contentHash = createHash("sha256")
      .update(
        `${dto.rawText || ""}|${extracted.reference || ""}|${extracted.plate || ""}`,
      )
      .digest("hex");

    let complianceDoc: {
      id: string;
      type: string;
      expiresAt: Date | null;
      status: string;
    } | null = null;
    if (vehicle) {
      const existing = await this.prisma.complianceDocument.findFirst({
        where: {
          organizationId,
          vehicleId: vehicle.id,
          type: docType,
        },
      });
      const status =
        extracted.expiresAt &&
        extracted.expiresAt.getTime() <= Date.now()
          ? DocStatus.EXPIRED
          : DocStatus.VALID;

      if (existing) {
        complianceDoc = await this.prisma.complianceDocument.update({
          where: { id: existing.id },
          data: {
            status,
            reference: extracted.reference,
            issuedAt: extracted.issuedAt,
            expiresAt: extracted.expiresAt,
            contentHash,
            fileRef: dto.fileRef,
            ocrPayload: {
              rawText: dto.rawText?.slice(0, 2000),
              extracted,
              actorId,
            },
            runtVerified: false,
          },
        });
      } else {
        complianceDoc = await this.prisma.complianceDocument.create({
          data: {
            organizationId,
            vehicleId: vehicle.id,
            type: docType,
            status,
            reference: extracted.reference,
            issuedAt: extracted.issuedAt,
            expiresAt: extracted.expiresAt,
            contentHash,
            fileRef: dto.fileRef,
            ocrPayload: {
              rawText: dto.rawText?.slice(0, 2000),
              extracted,
            },
          },
        });
      }

      // Bloqueo legal inmediato si TO vencida
      if (docType === ComplianceDocType.TARJETA_OPERACION) {
        await this.applyToExpiryBlockIfDue(vehicle.id, complianceDoc);
      }
    }

    let contractPdfRef: string | null = null;
    if (onboarding) {
      contractPdfRef = `/contracts/vinculacion/${onboarding.code}.pdf`;
      onboarding = await this.prisma.affiliateOnboarding.update({
        where: { id: onboarding.id },
        data: {
          stage: "VALIDATING_DOCS",
          plate: extracted.plate || onboarding.plate,
          vehicleId: vehicle?.id || onboarding.vehicleId,
          contractPdfRef,
          meta: {
            lastOcrType: docType,
            extracted,
            contractReady: true,
          },
        },
      });
    }

    await this.prisma.archiveDocument
      .create({
        data: {
          organizationId,
          title: `OCR ${docType} · ${extracted.plate || onboarding?.code || "n/a"}`,
          category: ArchiveCategory.OPS,
          docType: ArchiveDocType.OTHER,
          entityType: ArchiveEntityType.VEHICLE,
          entityId: vehicle?.id,
          vehicleId: vehicle?.id,
          fileRef: dto.fileRef || contractPdfRef || undefined,
          contentHash,
          validationStatus: ArchiveValidationStatus.VALIDATED,
          uploadedById: actorId,
          plate: extracted.plate?.toUpperCase(),
          ocrPayload: { module: "vinculaciones", docType, extracted },
          ocrProcessedAt: new Date(),
        },
      })
      .catch(() => null);

    await this.kafka.emit("vinculaciones.ocr.validated", {
      organizationId,
      docType,
      plate: extracted.plate,
      onboardingId: onboarding?.id,
      complianceDocId: complianceDoc?.id,
    });

    return {
      extracted,
      complianceDoc,
      onboarding,
      contractPdfRef,
      message: `OCR ${docType} validado${
        contractPdfRef ? ` · contrato ${contractPdfRef}` : ""
      }`,
    };
  }

  /**
   * Aplica bloqueo legal ROJO si Tarjeta de Operación venció (00:00 día vencimiento).
   * Rebota asignaciones en Logística vía complianceBlocked.
   */
  async applyToExpiryBlockIfDue(
    vehicleId: string,
    doc: {
      type: string;
      expiresAt: Date | null;
      status: string;
    },
  ) {
    const decision = shouldBlockVehicleOnToExpiry({
      docType: doc.type,
      expiresAt: doc.expiresAt,
      docStatus: doc.status,
    });
    if (!decision.block || !decision.reason) {
      return { blocked: false, vehicleId };
    }

    const patch = legalBlockVehiclePatch(decision.reason);
    const vehicle = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: patch,
    });

    await this.kafka.emit("tramites.vehiculo.suspendido", {
      vehicleId: vehicle.id,
      organizationId: vehicle.organizationId,
      plate: vehicle.plate,
      reason: decision.reason,
      source: "vinculaciones_to_expiry",
    });

    this.logger.warn(
      `Bloqueo Legal ROJO · ${vehicle.plate} · ${decision.reason}`,
    );

    return {
      blocked: true,
      legalRed: true,
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      reason: decision.reason,
      logisticsRebound: true,
    };
  }

  /** Barrido de alertas 15/7/0 días + bloqueo TO a medianoche (testable). */
  async runExpirySweep(organizationId: string, now = new Date()) {
    const docs = await this.prisma.complianceDocument.findMany({
      where: {
        organizationId,
        type: {
          in: [
            ComplianceDocType.TARJETA_OPERACION,
            ComplianceDocType.SOAT,
            ComplianceDocType.RCC,
            ComplianceDocType.RCE,
            ComplianceDocType.POLIZA_CONTRACTUAL,
          ],
        },
        expiresAt: { not: null },
      },
      include: {
        vehicle: { select: { id: true, plate: true, complianceBlocked: true } },
      },
    });

    const alerts: Array<{
      vehicleId: string;
      plate: string | undefined;
      type: string;
      expiresAt: Date;
      level: string;
    }> = [];
    let blocked = 0;
    for (const doc of docs) {
      if (!doc.expiresAt || !doc.vehicleId) continue;
      const level = expiryAlertLevel(doc.expiresAt, now);
      if (level === "GREEN") continue;
      alerts.push({
        vehicleId: doc.vehicleId,
        plate: doc.vehicle?.plate,
        type: doc.type,
        expiresAt: doc.expiresAt,
        level,
      });
      if (
        doc.type === ComplianceDocType.TARJETA_OPERACION &&
        (level === "RED_0" || level === "EXPIRED")
      ) {
        const r = await this.applyToExpiryBlockIfDue(doc.vehicleId, doc);
        if (r.blocked) blocked += 1;
        await this.prisma.complianceDocument.update({
          where: { id: doc.id },
          data: { status: DocStatus.EXPIRED },
        });
      }
    }

    return { alerts, blocked, scanned: docs.length };
  }

  async dashboard(organizationId: string) {
    const [pipeline, checks, vehicles] = await Promise.all([
      this.prisma.affiliateOnboarding.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 60,
      }),
      this.prisma.driverBackgroundCheck.findMany({
        where: { organizationId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      this.prisma.vehicle.findMany({
        where: { organizationId },
        include: {
          complianceDocs: {
            where: {
              type: {
                in: [
                  ComplianceDocType.SOAT,
                  ComplianceDocType.TECNOMECANICA,
                  ComplianceDocType.TARJETA_OPERACION,
                  ComplianceDocType.RCC,
                  ComplianceDocType.RCE,
                  ComplianceDocType.POLIZA_CONTRACTUAL,
                ],
              },
            },
          },
        },
        take: 80,
      }),
    ]);

    const kanban = {
      RECEIVED: pipeline.filter((p) => p.stage === "RECEIVED"),
      VALIDATING_DOCS: pipeline.filter((p) => p.stage === "VALIDATING_DOCS"),
      CONTRACT_SIGN: pipeline.filter((p) => p.stage === "CONTRACT_SIGN"),
      ACTIVE_FLEET: pipeline.filter((p) => p.stage === "ACTIVE_FLEET"),
    };

    const trafficLight = vehicles.map((v) => {
      const byType: Record<string, { status: string; expiresAt: Date | null; light: string }> = {};
      for (const d of v.complianceDocs) {
        const light =
          d.expiresAt != null
            ? expiryAlertLevel(d.expiresAt)
            : d.status === DocStatus.EXPIRED
              ? "EXPIRED"
              : "GREEN";
        byType[d.type] = {
          status: d.status,
          expiresAt: d.expiresAt,
          light,
        };
      }
      return {
        vehicleId: v.id,
        plate: v.plate,
        complianceBlocked: v.complianceBlocked,
        legalRed: v.status === VehicleStatus.COMPLIANCE_BLOCKED,
        docs: byType,
      };
    });

    return {
      kanban,
      trafficLight,
      recentChecks: checks,
      stats: {
        received: kanban.RECEIVED.length,
        validating: kanban.VALIDATING_DOCS.length,
        signing: kanban.CONTRACT_SIGN.length,
        active: kanban.ACTIVE_FLEET.length,
        blockedLegal: trafficLight.filter((t) => t.legalRed).length,
      },
      ui: { theme: "legal_funnel", splitScreenOcr: true },
    };
  }

  private heuristicExpiryFromText(raw?: string): Date | undefined {
    if (!raw) return undefined;
    const m = raw.match(
      /(\d{4}[-/]\d{2}[-/]\d{2})|(\d{2}[-/]\d{2}[-/]\d{4})/,
    );
    if (!m) return undefined;
    const d = new Date(m[0].replace(/(\d{2})[-/](\d{2})[-/](\d{4})/, "$3-$2-$1"));
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
}
