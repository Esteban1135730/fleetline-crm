"use client";

import type { ModuleId } from "@fsg/shared";

export type ModuleGuide = {
  title: string;
  summary: string;
  steps: [string, string, string];
};

const FALLBACK: ModuleGuide = {
  title: "Guía del módulo",
  summary: "Tres pasos para operar sin fricción en Fleetline OS.",
  steps: [
    "Use el menú por departamentos a la izquierda para cambiar de área.",
    "Busque placa, conductor o cliente con Cmd/Ctrl+K.",
    "Si duda, abra de nuevo este panel [ ? ] en cualquier pantalla.",
  ],
};

/** Guías de 3 pasos por módulo — Help Sheet TopBar */
export const MODULE_GUIDES: Partial<Record<ModuleId | "cuenta", ModuleGuide>> =
  {
    dashboard: {
      title: "Cómo leer el cockpit",
      summary: "Estado operativo del día sin ruido visual.",
      steps: [
        "Revise los tres KPIs: viajes activos, alertas/bloqueos y facturación.",
        "Use Acciones rápidas para crear viaje, OT, consultar vehículo o ver GPS.",
        "Si hay alertas en ámbar/rojo, abra Trámites o Logística según el caso.",
      ],
    },
    logistica: {
      title: "Cómo crear y controlar un viaje",
      summary: "Despacho, preoperacional, ruta en vivo y cierre.",
      steps: [
        "Asigne unidad y conductor aptos; el conductor firma el preoperacional en la app.",
        "Sin preoperacional aprobado no hay IN_TRANSIT ni GPS. Revise la ficha en el inspector.",
        "Marque «En vía», «Cerrar» o «Novedad»; filtre Todos / En ruta / Alertas.",
      ],
    },
    tramites: {
      title: "Cómo interpretar el semáforo",
      summary: "Documentación de flota y bloqueo de despacho.",
      steps: [
        "Verde: apto (>15 días). Amarillo: vence pronto (≤15). Rojo: vencido — no despachar.",
        "Registre SOAT, tecnomecánica o tarjeta de operación con fecha de vigencia.",
        "Filtre Alertas/bloqueados para priorizar renovaciones antes del despacho.",
      ],
    },
    comercial: {
      title: "Cómo operar comercial",
      summary: "Clientes, cotizaciones y contratos.",
      steps: [
        "Alta de cliente con NIT válido (SARLAFT puede bloquear sujetos de alto riesgo).",
        "Cree cotización y convierta a contrato cuando esté ganada.",
        "El contrato genera viaje borrador en Logística para despacho.",
      ],
    },
    parqueadero: {
      title: "Cómo controlar el patio",
      summary: "Ingreso y salida de unidades.",
      steps: [
        "Registre check-in con placa al entrar al patio.",
        "Al salir, haga check-out del mismo registro.",
        "Consulte el resumen del día para ocupación y movimientos.",
      ],
    },
    taller: {
      title: "Cómo registrar mantenimiento",
      summary: "Órdenes de trabajo y estado de flota.",
      steps: [
        "Abra una OT vinculada al vehículo.",
        "Actualice el estado hasta cerrar (DONE).",
        "Un odómetro alto puede generar OT preventiva automática.",
      ],
    },
    compras: {
      title: "Cómo solicitar compras",
      summary: "Abastecimiento hasta recepción.",
      steps: [
        "Cree la solicitud con proveedor e importe.",
        "Avance estados de aprobación según flujo.",
        "Cierre con recepción cuando llegue el material.",
      ],
    },
    finanzas: {
      title: "Cómo operar tesorería",
      summary: "CxC, CxP y pagos controlados.",
      steps: [
        "Revise facturas emitidas por cobrar o por pagar.",
        "En CxP, apruebe el pago antes de marcar pagada.",
        "SARLAFT puede bloquear pagos a sujetos de alto riesgo.",
      ],
    },
    archivo: {
      title: "Cómo usar el Data Room",
      summary: "Bóveda documental con sello SHA-256.",
      steps: [
        "Suba el archivo: el sistema genera hash de integridad.",
        "Filtre por categoría o busque título, tag o hash.",
        "Revise la auditoría de bóveda para trazabilidad.",
      ],
    },
    sarlaft: {
      title: "Cómo registrar SARLAFT",
      summary: "Listas de riesgo y bloqueo operativo.",
      steps: [
        "Registre el chequeo con documento y nivel de riesgo.",
        "HIGH/BLOCKED impiden alta de cliente y pago CxP.",
        "Solo roles privilegiados pueden forzar override con auditoría.",
      ],
    },
    calidad: {
      title: "Cómo registrar calidad",
      summary: "NPS e incidentes HSQE.",
      steps: [
        "Cargue el evento con tipo y detalle.",
        "Use scores NPS cuando aplique encuesta.",
        "Escalone incidentes críticos al área responsable.",
      ],
    },
    cuenta: {
      title: "Cómo gestionar su cuenta",
      summary: "Perfil y acceso.",
      steps: [
        "Revise nombre y rol asignado.",
        "Cambie la contraseña desde este módulo.",
        "Cierre sesión al terminar en equipos compartidos.",
      ],
    },
  };

export function guideForPath(pathname: string): ModuleGuide {
  const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
  return MODULE_GUIDES[seg as ModuleId | "cuenta"] || FALLBACK;
}
