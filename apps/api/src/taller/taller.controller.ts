import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ModulesGuard, RequireModule } from "../auth/modules.guard";
import { Roles, RolesGuard } from "../auth/roles.guard";
import { Permissions, PermissionsGuard } from "../auth/permissions.guard";
import { TallerService, WorkOrderService } from "./work-order.service";
import { PartDispatchService } from "./part-dispatch.service";
import { TelemetryIngestService } from "./telemetry-ingest.service";
import { MechanicService } from "./mechanic.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  CloseWorkOrderDto,
  CreateWorkOrderDto,
  DispatchPartDto,
  TelemetryIngestDto,
} from "./dto/taller.dto";
import {
  CrearOrdenSchema,
  DespacharQrSchema,
  FindingSchema,
  LiberarQcSchema,
  TimeTrackingSchema,
} from "./dto/taller-v4.dto";

type AuthReq = {
  user: { organizationId: string; userId: string; role: string };
};

const TALLER_ROLES = [
  "coordinador_taller",
  "COORDINADOR_TALLER",
  "auxiliar_almacen_taller",
  "AUXILIAR_ALMACEN_TALLER",
  "auxiliar_contable_taller",
  "mecanico",
  "MECANICO",
  "director_operativo",
  "gerente_general",
  "org_admin",
  "platform_master",
  "superadmin",
] as const;

/**
 * Suite Taller 4.0 — Módulos 19 / 19.1 / 20
 * Prefijos: /taller · /api/v1/taller
 */
@Controller(["taller", "api/v1/taller"])
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModulesGuard)
@RequireModule("taller")
@Roles(...TALLER_ROLES)
export class TallerController {
  constructor(
    private taller: TallerService,
    private workOrders: WorkOrderService,
    private parts: PartDispatchService,
    private telemetry: TelemetryIngestService,
    private mechanic: MechanicService,
    private prisma: PrismaService,
  ) {}

  @Get("vehicles")
  @Permissions("taller_ot", "READ")
  vehicles(@Req() req: AuthReq) {
    return this.taller.listVehicles(req.user.organizationId);
  }

  @Get("work-orders")
  @Permissions("taller_ot", "READ")
  listWo(@Req() req: AuthReq) {
    return this.taller.listWorkOrders(req.user.organizationId);
  }

  @Get("coordinador/dashboard")
  @Permissions("taller_ot", "READ")
  coordDash(@Req() req: AuthReq) {
    return this.workOrders.coordinadorDashboard(req.user.organizationId);
  }

  @Get("almacen/dashboard")
  @Permissions("taller_inventario", "READ")
  async almacenDash(@Req() req: AuthReq) {
    const [items, openOrders, recent] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: { organizationId: req.user.organizationId },
        orderBy: { sku: "asc" },
        take: 100,
      }),
      this.prisma.workOrder.findMany({
        where: {
          organizationId: req.user.organizationId,
          status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PARTS"] },
        },
        include: {
          vehicle: { select: { plate: true } },
          assignedTo: { select: { id: true, name: true } },
        },
        take: 40,
      }),
      this.prisma.partDispatch.findMany({
        where: { workOrder: { organizationId: req.user.organizationId } },
        orderBy: { dispatchedAt: "desc" },
        take: 15,
        include: {
          inventoryItem: { select: { sku: true, name: true } },
          workOrder: { select: { code: true } },
        },
      }),
    ]);
    return {
      hub: "Smart Warehouse",
      role: "AUXILIAR_ALMACEN_TALLER",
      inventory: items.map((i) => ({
        id: i.id,
        sku: i.sku,
        name: i.name,
        qrCode: i.qrCode,
        serial: i.serial,
        quantity: i.quantity,
        unitCost: Number(i.unitCost),
        status: i.status,
      })),
      dispatchTray: openOrders.map((o) => ({
        workOrderId: o.id,
        code: o.code,
        plate: o.vehicle.plate,
        mechanic: o.assignedTo?.name ?? null,
        status: o.status,
      })),
      recentDispatches: recent,
    };
  }

  @Get("mecanico/mis-ordenes")
  @Permissions("taller_mecanico", "READ")
  misOrdenes(@Req() req: AuthReq) {
    return this.mechanic.myOrders(req.user.organizationId, req.user.userId);
  }

  /** POST /api/v1/taller/ordenes/crear */
  @Post("ordenes/crear")
  @Permissions("taller_ot", "CREATE")
  crearOrden(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = CrearOrdenSchema.parse(body ?? {});
    return this.workOrders.create(req.user.organizationId, dto);
  }

  @Post("work-orders")
  @Permissions("taller_ot", "CREATE")
  createWo(@Req() req: AuthReq, @Body() body: CreateWorkOrderDto) {
    return this.taller.createWorkOrder(req.user.organizationId, body);
  }

  /** POST /api/v1/taller/almacen/despachar-qr */
  @Post("almacen/despachar-qr")
  @Permissions("taller_despacho", "CREATE")
  despacharQr(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = DespacharQrSchema.parse(body ?? {});
    return this.parts.dispatchPart(
      req.user.organizationId,
      req.user.userId,
      dto.workOrderId,
      {
        inventoryItemId: dto.inventoryItemId,
        partQr: dto.partQr,
        serial: dto.serial,
        mechanicQr: dto.mechanicQr,
        mechanicUserId: dto.mechanicUserId,
        quantity: dto.quantity,
        photoOldRef: dto.photoOldRef,
        photoNewRef: dto.photoNewRef,
      },
    );
  }

  @Post("work-orders/:id/dispatch-part")
  @Permissions("taller_despacho", "CREATE")
  dispatchPart(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: DispatchPartDto,
  ) {
    return this.parts.dispatchPart(
      req.user.organizationId,
      req.user.userId,
      id,
      body,
    );
  }

  /** POST /api/v1/taller/mecanico/time-tracking */
  @Post("mecanico/time-tracking")
  @Permissions("taller_mecanico", "UPDATE")
  timeTracking(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = TimeTrackingSchema.parse(body ?? {});
    return this.mechanic.timeTracking(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  @Post("mecanico/hallazgo")
  @Permissions("taller_mecanico", "CREATE")
  hallazgo(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = FindingSchema.parse(body ?? {});
    return this.mechanic.reportFinding(
      req.user.organizationId,
      req.user.userId,
      dto,
    );
  }

  /** POST /api/v1/taller/ordenes/liberar-qc */
  @Post("ordenes/liberar-qc")
  @Permissions("taller_qc", "UPDATE")
  liberarQc(@Req() req: AuthReq, @Body() body: unknown) {
    const dto = LiberarQcSchema.parse(body ?? {});
    return this.workOrders.liberarQc(
      req.user.organizationId,
      dto.workOrderId,
      dto,
      req.user.userId,
    );
  }

  @Post("work-orders/:id/close")
  @Permissions("taller_qc", "UPDATE")
  closeWo(
    @Req() req: AuthReq,
    @Param("id") id: string,
    @Body() body: CloseWorkOrderDto,
  ) {
    return this.taller.closeWorkOrder(req.user.organizationId, id, body);
  }

  @Post("telemetry/ingest")
  @Permissions("taller_ot", "CREATE")
  ingestTelemetry(@Req() req: AuthReq, @Body() body: TelemetryIngestDto) {
    return this.telemetry.ingest(req.user.organizationId, body);
  }
}
