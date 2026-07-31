"use client";

import type { ModuleId } from "@fsg/shared";
import { resolveModuleId } from "@fsg/shared";

export type ModuleGuide = {
  title: string;
  summary: string;
  steps: [string, string, string];
};

const FALLBACK: ModuleGuide = {
  title: "Guía del área",
  summary: "Tres pasos para operar sin fricción en Fleetline OS.",
  steps: [
    "Use el menú de áreas corporativas a la izquierda para cambiar de módulo.",
    "Busque placa, conductor o cliente con Cmd/Ctrl+K.",
    "Si duda, abra de nuevo este panel [ ? ] en cualquier pantalla.",
  ],
};

/** Guías de 3 pasos — 17 áreas + secundarios */
export const MODULE_GUIDES: Partial<Record<ModuleId | "cuenta", ModuleGuide>> =
  {
    presidencia: {
      title: "Cómo operar Presidencia",
      summary: "Gobierno corporativo y tablero ejecutivo.",
      steps: [
        "Revise KPIs agregados de flota, margen y cumplimiento al inicio de jornada.",
        "Escale alertas críticas a Gerencia General o al área dueña del riesgo.",
        "Use Cmd/Ctrl+/ para reabrir esta guía en cualquier momento.",
      ],
    },
    gerencia: {
      title: "Cómo operar Gerencia General",
      summary: "Coordinación inter-áreas y prioridades del día.",
      steps: [
        "Priorice bloqueos de despacho, OT críticas y CxC vencida.",
        "Asigne follow-up a Logística, Comercial, RRHH o Tesorería según el caso.",
        "Confirme cierre de alertas antes de finalizar la jornada.",
      ],
    },
    rrhh: {
      title: "Cómo operar Recursos Humanos",
      summary: "Personal, aptitud y fatiga operativa.",
      steps: [
        "Consulte el estado laboral y fatiga antes de autorizar despacho.",
        "Actualice novedades de personal por área.",
        "Coordine con QHSE ante incidentes que involucren personas.",
      ],
    },
    revisoria_fiscal: {
      title: "Cómo operar Revisoría Fiscal",
      summary: "Hallazgos, seguimiento y cierre.",
      steps: [
        "Registre el hallazgo con evidencia y área responsable.",
        "Haga seguimiento hasta remediación documentada.",
        "Escale incumplimientos reiterados a Presidencia.",
      ],
    },
    contabilidad: {
      title: "Cómo operar Contabilidad",
      summary: "PUC, asientos y balance de prueba.",
      steps: [
        "Verifique cuentas PUC antes de registrar el asiento.",
        "Registre partida doble (débito = crédito).",
        "Revise el balance de prueba al cierre del período.",
      ],
    },
    tesoreria: {
      title: "Cómo operar Tesorería",
      summary: "CxC, CxP y pagos controlados.",
      steps: [
        "Revise facturas emitidas por cobrar o por pagar.",
        "En CxP, apruebe el pago antes de marcar pagada.",
        "SARLAFT puede bloquear pagos a sujetos de alto riesgo.",
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
    comercial: {
      title: "Cómo operar Comercial",
      summary: "Clientes, cotizaciones y contratos.",
      steps: [
        "Alta de cliente con NIT válido (SARLAFT puede bloquear sujetos de alto riesgo).",
        "Cree cotización y convierta a contrato cuando esté ganada.",
        "El contrato genera viaje borrador en Logística para despacho.",
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
    qhse: {
      title: "Cómo operar QHSE",
      summary: "Calidad, seguridad e incidentes HSQE.",
      steps: [
        "Registre el evento con tipo, severidad y área involucrada.",
        "Use scores NPS cuando aplique encuesta de servicio.",
        "Escalone incidentes críticos a Gerencia y RRHH.",
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
    tramites: {
      title: "Cómo interpretar el semáforo",
      summary: "Documentación de flota y bloqueo de despacho.",
      steps: [
        "Verde: apto (>15 días). Amarillo: vence pronto (≤15). Rojo: vencido — no despachar.",
        "Registre SOAT, tecnomecánica o tarjeta de operación con fecha de vigencia.",
        "Filtre Alertas/bloqueados para priorizar renovaciones antes del despacho.",
      ],
    },
    tecnologia_ti: {
      title: "Cómo operar Tecnología y TI",
      summary: "NOC, salud de API/DB y alertas.",
      steps: [
        "Verifique ping de API y latencia de base de datos.",
        "Revise alertas abiertas y asigne resolución.",
        "Documente incidentes de uptime para auditoría.",
      ],
    },
    archivo: {
      title: "Cómo usar Archivo y Papelería",
      summary: "Data Room con sello SHA-256.",
      steps: [
        "Suba el archivo: el sistema genera hash de integridad.",
        "Filtre por categoría o busque título, tag o hash.",
        "Revise la auditoría de bóveda para trazabilidad.",
      ],
    },
    call_center: {
      title: "Cómo operar Recepción y Call Center",
      summary: "Visitantes y tickets de atención.",
      steps: [
        "Alterne las pestañas Call Center / Recepción según el flujo.",
        "Registre tickets con canal, prioridad y agente.",
        "En recepción, haga check-in y check-out de cada visitante.",
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
    parqueadero: {
      title: "Cómo controlar el patio",
      summary: "Ingreso y salida de unidades.",
      steps: [
        "Registre check-in con placa al entrar al patio.",
        "Al salir, haga check-out del mismo registro.",
        "Consulte el resumen del día para ocupación y movimientos.",
      ],
    },
    dashboard: {
      title: "Cómo leer el cockpit",
      summary: "Estado operativo del día sin ruido visual.",
      steps: [
        "Revise los KPIs: viajes activos, alertas/bloqueos y facturación.",
        "Use Acciones rápidas para crear viaje, OT, consultar vehículo o ver GPS.",
        "Si hay alertas en ámbar/rojo, abra Trámites o Logística según el caso.",
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
  if (seg === "cuenta") return MODULE_GUIDES.cuenta || FALLBACK;
  const resolved = resolveModuleId(seg);
  if (resolved && MODULE_GUIDES[resolved]) return MODULE_GUIDES[resolved]!;
  return MODULE_GUIDES[seg as ModuleId] || FALLBACK;
}
