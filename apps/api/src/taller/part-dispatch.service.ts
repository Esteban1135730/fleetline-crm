import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InventoryItemStatus, WorkOrderStatus } from "@fsg/db";
import { PrismaService } from "../prisma/prisma.service";
import { KafkaEventsService } from "../logistics/kafka-events.service";
import type { DispatchPartDto } from "./dto/taller.dto";

@Injectable()
export class PartDispatchService {
  constructor(
    private prisma: PrismaService,
    private kafka: KafkaEventsService,
  ) {}

  /**
   * Despacho antifraude: exige QR o serial válido en InventoryItem.
   */
  async dispatchPart(
    organizationId: string,
    userId: string,
    workOrderId: string,
    dto: DispatchPartDto,
  ) {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, organizationId },
    });
    if (!wo) throw new NotFoundException("OT no encontrada");
    if (wo.status === WorkOrderStatus.DONE) {
      throw new BadRequestException("No se puede despachar a una OT cerrada");
    }

    const qr = dto.partQr?.trim();
    const serial = dto.serial?.trim();
    if (!dto.inventoryItemId && !qr && !serial) {
      throw new BadRequestException({
        error: "PART_QR_OR_SERIAL_REQUIRED",
        message:
          "Antifraude: indique partQr, serial o inventoryItemId del inventario",
      });
    }

    const item = await this.prisma.inventoryItem.findFirst({
      where: {
        organizationId,
        status: {
          in: [InventoryItemStatus.AVAILABLE, InventoryItemStatus.RESERVED],
        },
        ...(dto.inventoryItemId
          ? { id: dto.inventoryItemId }
          : {
              OR: [
                ...(qr ? [{ qrCode: qr }] : []),
                ...(serial ? [{ serial }] : []),
              ],
            }),
      },
    });

    if (!item) {
      throw new BadRequestException({
        error: "INVALID_PART_QR_SERIAL",
        message:
          "Repuesto no encontrado en inventario / QR o serial inválido",
      });
    }

    // Si enviaron QR/serial, debe coincidir exactamente con el ítem
    if (qr && item.qrCode !== qr) {
      throw new BadRequestException({
        error: "INVALID_PART_QR_SERIAL",
        message: "QR no coincide con el inventario",
      });
    }
    if (serial && item.serial && item.serial !== serial) {
      throw new BadRequestException({
        error: "INVALID_PART_QR_SERIAL",
        message: "Serial no coincide con el inventario",
      });
    }
    if (serial && !item.serial) {
      throw new BadRequestException({
        error: "INVALID_PART_QR_SERIAL",
        message: "El ítem no tiene serial registrado",
      });
    }

    const qty = dto.quantity ?? 1;
    if (item.quantity < qty) {
      throw new BadRequestException({
        error: "INSUFFICIENT_STOCK",
        message: `Stock insuficiente (${item.quantity}) para despachar ${qty}`,
      });
    }

    const required = await this.prisma.workOrderPart.findUnique({
      where: {
        workOrderId_inventoryItemId: {
          workOrderId: wo.id,
          inventoryItemId: item.id,
        },
      },
    });
    if (!required) {
      await this.prisma.workOrderPart.create({
        data: {
          workOrderId: wo.id,
          inventoryItemId: item.id,
          quantity: qty,
        },
      });
    }

    const dispatch = await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: {
          quantity: { decrement: qty },
          status:
            item.quantity - qty <= 0
              ? InventoryItemStatus.DEPLETED
              : InventoryItemStatus.AVAILABLE,
        },
      });

      return tx.partDispatch.create({
        data: {
          workOrderId: wo.id,
          inventoryItemId: item.id,
          dispatchedById: userId,
          partQrScanned: qr || item.qrCode,
          mechanicQrScanned: dto.mechanicQr,
          photoOldRef: dto.photoOldRef,
          photoNewRef: dto.photoNewRef,
          cvValidationOk:
            Boolean(dto.photoOldRef) && Boolean(dto.photoNewRef)
              ? true
              : null,
        },
        include: {
          inventoryItem: {
            select: { id: true, sku: true, name: true, serial: true, qrCode: true },
          },
        },
      });
    });

    if (wo.status === WorkOrderStatus.OPEN) {
      await this.prisma.workOrder.update({
        where: { id: wo.id },
        data: { status: WorkOrderStatus.IN_PROGRESS },
      });
    }

    const amount = Number(item.unitCost) * qty;
    await this.kafka.emitPartDispatched({
      organizationId,
      amount,
      workOrderId: wo.id,
      inventoryItemId: item.id,
      quantity: qty,
    });

    return {
      dispatch,
      stockRemaining: item.quantity - qty,
      antifraud: "QR_SERIAL_VALIDATED",
    };
  }
}
