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
  summary: "Tres pasos para operar sin fricción en NEXA OS.",
  steps: [
    "Use el menú de áreas corporativas a la izquierda para cambiar de módulo.",
    "Busque placa, conductor o cliente con Cmd/Ctrl+K.",
    "Si duda, abra de nuevo este panel [ ? ] en cualquier pantalla.",
  ],
};

/** Guías de 3 pasos — 17 áreas + secundarios */
export const MODULE_GUIDES: Partial<Record<ModuleId | "cuenta", ModuleGuide>> =
  {
    plataforma: {
      title: "Consola Usuario Maestro",
      summary: "Alta de empresas y administrador por organización.",
      steps: [
        "Registre la empresa con NIT único y datos del administrador.",
        "El administrador gestiona usuarios de su flota desde Usuarios.",
        "Use el directorio global en Usuarios para auditar todas las cuentas.",
      ],
    },
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
      summary: "Personal, fatiga operativa, nómina y PESV.",
      steps: [
        "Consulte fatiga operativa y licencias antes de autorizar despacho.",
        "Ejecute la auditoría documental solo cuando quiera aplicar bloqueos reales.",
        "La liquidación de nómina confirma el periodo de forma definitiva (no es simulación).",
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
      title: "Cómo operar Logística",
      summary:
        "Submenú: Programación de Servicios / Gestión de Conductores y Nómina de Extras.",
      steps: [
        "Programación: cree el servicio con placa, conductor, horario y puntos origen/destino.",
        "Pendiente = ruta sugerida; En proceso = GPS en vivo con TripAuditLog del servidor.",
        "Conductores: novedades con relevos PESV; al cerrar servicio se liquidan extras CO.",
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
      title: "Calidad, seguridad y medio ambiente (QHSE)",
      summary:
        "QHSE = Quality, Health, Safety & Environment: calidad del servicio, salud/seguridad ocupacional (PESV) e incidentes ambientales/operativos.",
      steps: [
        "Registre eventos: incidente, auditoría, NPS (satisfacción 0–10) u otro tipo disponible.",
        "Consulte el radar de prevención (preoperacionales, licencias) y cierre reportes abiertos.",
        "Exporte la auditoría PESV o la huella CO₂ cuando necesite evidencias para autoridades o gerencia.",
      ],
    },
    sarlaft: {
      title: "Para qué sirve SARLAFT",
      summary:
        "Debida diligencia AML/KYC: consulta sujetos contra listas restrictivas, clasifica riesgo y puede bloquear operaciones en Comercial, Compras, Logística y Tesorería.",
      steps: [
        "Registre una consulta con nombre, documento y nivel de riesgo; el sistema también puede cruzar listas (OFAC/ONU/PEPS) y abrir alertas.",
        "Adjunte evidencias (Policía, Procuraduría, Registraduría, antecedentes, listas) en el expediente del chequeo.",
        "Riesgo alto/bloqueado o alerta abierta puede impedir alta de cliente y pagos CxP; solo roles privilegiados fuerzan override con auditoría.",
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
      summary:
        "Monitoreo NOC, usuarios, helpdesk y emparejamiento MDM de tablets (FSG Pilot) por QR temporal.",
      steps: [
        "Revise salud de infraestructura, CPU y alertas del centro de operaciones.",
        "Genere alta de usuario o tickets de mesa de ayuda según el caso.",
        "MDM Provisioning crea un QR/código temporal: al escanearlo con la app FSG Pilot, el dispositivo se empareja (modo quiosco/bloqueo si aplica) hasta que expire el código.",
      ],
    },
    archivo: {
      title: "Para qué sirve Archivo",
      summary:
        "Bóveda documental y papelería: localizar expedientes/unidades/personas, consultar digitalización, prestar carpetas físicas y despachar suministros, con trazabilidad de custodia.",
      steps: [
        "Busque por contrato, placa, cédula o texto: verá expedientes, vehículos, conductores, personal o clientes y si hay PDF digital.",
        "Consulte la cola OCR, pendientes de digitalizar, préstamos activos, inventario y el log de custodia (hash e historial).",
        "Acciones operativas: préstamo (check-out) de carpeta física y despacho de papelería/suministros. No hay compartir ni versionado en esta pantalla.",
      ],
    },
    juridico: {
      title: "Cómo emitir Contratos FUEC",
      summary: "Extracto único imprimible con hard-stop documental.",
      steps: [
        "Abra Nuevo contrato y complete contratante, ruta, placa y conductores.",
        "Revise Datos Importantes: SOAT, RCC-RCE, tarjeta de operación y afiliación deben estar vigentes.",
        "Guarde para generar el PDF ministerial; el conductor lo exporta desde la app (Mis FUEC).",
      ],
    },
    call_center: {
      title: "Cómo operar Recepción y centro de llamadas",
      summary: "Visitantes, mensajes entrantes y pase a Comercial o QHSE.",
      steps: [
        "Revise la bandeja de mensajes (WhatsApp, correo, llamadas) y seleccione uno para actuar.",
        "Registre visitantes con anfitrión (persona de la empresa que los recibe) y gafete.",
        "Si alguien pide cotización, envíelo a Comercial como cliente potencial; las PQRS van a QHSE.",
      ],
    },
    taller: {
      title: "Cómo registrar mantenimiento",
      summary: "Órdenes de trabajo y estado de flota.",
      steps: [
        "Abra una OT vinculada al vehículo.",
        "Actualice el estado hasta cerrar (terminado).",
        "Un odómetro alto puede generar OT preventiva automática.",
      ],
    },
    parqueadero: {
      title: "Cómo controlar el patio",
      summary: "Ingreso y salida de unidades.",
      steps: [
        "Registre el ingreso con placa al entrar al patio.",
        "Al salir, registre la salida del mismo movimiento.",
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
      summary: "Perfil, acceso y recorridos guiados.",
      steps: [
        "Revise nombre y rol asignado en Perfil operativo.",
        "Cambie la contraseña desde Seguridad.",
        "Reactive o desactive el recorrido guiado en esta misma pantalla.",
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
