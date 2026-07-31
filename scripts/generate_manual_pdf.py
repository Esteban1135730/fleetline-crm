#!/usr/bin/env python3
"""Genera el Manual Operativo Fleetline OS (PDF) — solo funcionalidad implementada."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUT = Path(__file__).resolve().parents[1] / "docs" / "MANUAL_OPERATIVO_FLEETLINE_OS.pdf"

# Aero-Tech palette (print-friendly)
INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#64748B")
ACCENT = colors.HexColor("#0D9488")
SURFACE = colors.HexColor("#F4F6F9")
LINE = colors.HexColor("#E2E8F0")
AMBER = colors.HexColor("#D97706")
CRIT = colors.HexColor("#DC2626")


def styles():
    base = getSampleStyleSheet()
    s = {
        "cover_brand": ParagraphStyle(
            "cover_brand",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=28,
            textColor=ACCENT,
            alignment=TA_CENTER,
            spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=20,
            textColor=INK,
            alignment=TA_CENTER,
            spaceAfter=6,
            leading=26,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=11,
            textColor=MUTED,
            alignment=TA_CENTER,
            leading=16,
            spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base["Heading1"],
            fontName="Helvetica-Bold",
            fontSize=16,
            textColor=INK,
            spaceBefore=4,
            spaceAfter=10,
            borderPadding=3,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            textColor=ACCENT,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            textColor=INK,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=INK,
            alignment=TA_JUSTIFY,
            leading=13,
            spaceAfter=6,
        ),
        "bullet": ParagraphStyle(
            "bullet",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            textColor=INK,
            leading=13,
            leftIndent=4,
        ),
        "note": ParagraphStyle(
            "note",
            parent=base["Normal"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            textColor=MUTED,
            leading=12,
            spaceBefore=4,
            spaceAfter=8,
        ),
        "toc": ParagraphStyle(
            "toc",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10,
            textColor=INK,
            leading=18,
        ),
        "footer": ParagraphStyle(
            "footer",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8,
            textColor=MUTED,
            alignment=TA_CENTER,
        ),
        "table_cell": ParagraphStyle(
            "table_cell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.5,
            textColor=INK,
            leading=11,
        ),
        "table_head": ParagraphStyle(
            "table_head",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.5,
            textColor=colors.white,
            leading=11,
        ),
    }
    return s


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, A4[1] - 1.4 * cm, A4[0] - 2 * cm, A4[1] - 1.4 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2 * cm, A4[1] - 1.1 * cm, "Fleetline OS — Manual operativo")
    canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 1.1 * cm, "Solo funcionalidad desplegada")
    canvas.line(2 * cm, 1.3 * cm, A4[0] - 2 * cm, 1.3 * cm)
    canvas.drawCentredString(A4[0] / 2, 0.8 * cm, f"Página {doc.page}")
    canvas.restoreState()


def p(text, style):
    return Paragraph(text.replace("\n", "<br/>"), style)


def bullets(items, st):
    return ListFlowable(
        [ListItem(Paragraph(i, st["bullet"]), leftIndent=8, bulletColor=ACCENT) for i in items],
        bulletType="bullet",
        start="•",
        leftIndent=12,
        spaceBefore=2,
        spaceAfter=8,
    )


def table(headers, rows, st, col_widths=None):
    data = [[Paragraph(h, st["table_head"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), st["table_cell"]) for c in row])
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SURFACE]),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


def build():
    st = styles()
    story = []

    # ——— Portada ———
    story.append(Spacer(1, 4.5 * cm))
    story.append(p("FLEETLINE OS", st["cover_brand"]))
    story.append(p("Manual operativo del CRM", st["cover_title"]))
    story.append(Spacer(1, 0.4 * cm))
    story.append(
        p(
            "Guía formal de uso de las funciones ya desarrolladas<br/>"
            "en el monorepo Fleetline (web, API y app conductor).",
            st["cover_sub"],
        )
    )
    story.append(Spacer(1, 1.2 * cm))
    meta = Table(
        [
            ["Producto", "Fleetline OS — CRM & Telemetry"],
            ["Organización demo", "FSG Transportes S.A.S."],
            ["Versión del manual", "1.0 — Julio 2026"],
            ["Alcance", "Únicamente lo implementado en código"],
            ["Audiencia", "Operaciones, comercial, finanzas, despacho, RRHH, TI"],
        ],
        colWidths=[4.5 * cm, 10 * cm],
    )
    meta.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (1, 0), (1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
                ("TEXTCOLOR", (1, 0), (1, -1), INK),
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(meta)
    story.append(Spacer(1, 2 * cm))
    story.append(
        p(
            "Este documento no describe roadmap ni módulos futuros. "
            "Si una capacidad no aparece aquí, no debe asumirse en producción.",
            st["note"],
        )
    )
    story.append(PageBreak())

    # ——— TOC ———
    story.append(p("1. Contenido", st["h1"]))
    toc_items = [
        "2. Qué es Fleetline OS (alcance real)",
        "3. Acceso, roles y permisos",
        "4. Interfaz: shell, navegación y atajos",
        "5. Módulos del CRM web",
        "6. App conductor",
        "7. Reglas duras (compliance, fatiga, documentos)",
        "8. SARLAFT y archivo documental",
        "9. Cotizador comercial y ciclo a viaje",
        "10. Preoperacional y despacho",
        "11. Credenciales de demostración",
        "12. Accesos técnicos (puertos)",
    ]
    for item in toc_items:
        story.append(p(item, st["toc"]))
    story.append(PageBreak())

    # ——— 2 ———
    story.append(p("2. Qué es Fleetline OS (alcance real)", st["h1"]))
    story.append(
        p(
            "Fleetline OS es el sistema de torre de control de flota ya operativo en el monorepo: "
            "CRM web (Next.js), API (NestJS) y aplicación móvil del conductor (Expo). "
            "Une despacho, documentos vehiculares, comercial, taller, patio, tesorería, "
            "cumplimiento SARLAFT y archivo con hash en un solo producto.",
            st["body"],
        )
    )
    story.append(p("Componentes desplegados", st["h2"]))
    story.append(
        table(
            ["Capa", "Paquete", "Función"],
            [
                ["CRM web", "@fsg/web", "Interfaz operativa por módulos y roles"],
                ["API", "@fsg/api", "REST + JWT + WebSocket de logística"],
                ["App conductor", "@fsg/conductor", "Viajes, preoperacional y GPS"],
                ["Datos", "@fsg/db", "PostgreSQL + Prisma + seed"],
                ["Contratos", "@fsg/shared", "Roles, Zod, hard rules, cotizador"],
            ],
            st,
            [3.2 * cm, 3.5 * cm, 9.3 * cm],
        )
    )
    story.append(PageBreak())

    # ——— 3 ———
    story.append(p("3. Acceso, roles y permisos", st["h1"]))
    story.append(
        p(
            "El ingreso es por JWT. En web el token se guarda en localStorage; "
            "en la app conductor, en SecureStore. Desde el login también se puede "
            "registrar una organización nueva con su usuario administrador.",
            st["body"],
        )
    )
    story.append(p("Capacidades de autenticación", st["h2"]))
    story.append(
        bullets(
            [
                "Iniciar sesión (email + contraseña).",
                "Registrar organización + administrador.",
                "Consultar sesión actual (/auth/me).",
                "Cambiar contraseña en Mi cuenta (/cuenta).",
                "Cerrar sesión desde la barra superior.",
            ],
            st,
        )
    )
    story.append(p("Roles y módulos visibles", st["h2"]))
    story.append(
        table(
            ["Rol", "Módulos a los que puede entrar"],
            [
                ["Presidencia", "Todos los módulos del CRM"],
                [
                    "Gerencia",
                    "Dashboard, Apps, Comercial, Logística, Parqueadero, Trámites, "
                    "Taller, Compras, RRHH, Atención, Calidad, Recepción",
                ],
                [
                    "Finanzas",
                    "Dashboard, Finanzas, Contabilidad, Revisoría, Compras, "
                    "Jurídico, SARLAFT, Archivo",
                ],
                [
                    "Despacho",
                    "Dashboard, Logística, Parqueadero, Trámites, Taller, Comercial, Apps",
                ],
                ["RRHH", "Dashboard, RRHH, Calidad, Archivo"],
                ["Atención", "Dashboard, Atención, Calidad, Recepción, Apps"],
                ["Sistemas", "Dashboard, Sistemas, Usuarios, Archivo"],
            ],
            st,
            [3.2 * cm, 12.8 * cm],
        )
    )
    story.append(
        p(
            "La API aplica los mismos límites con JWT + ModulesGuard. "
            "La gestión de usuarios (/usuarios) exige además Presidencia o Sistemas.",
            st["note"],
        )
    )
    story.append(PageBreak())

    # ——— 4 ———
    story.append(p("4. Interfaz: shell, navegación y atajos", st["h1"]))
    story.append(
        bullets(
            [
                "Barra superior: marca Fleetline OS, módulo activo, búsqueda, "
                "estado del sistema (NOMINAL / ALERT / OFFLINE), ayuda [?], "
                "tema claro/oscuro y chip de usuario.",
                "Menú lateral por departamentos (varios abiertos a la vez; "
                "estado guardado en el navegador): Operaciones y flota; "
                "Comercial y clientes; Mantenimiento y taller; "
                "Finanzas y gobierno; Personas y mando.",
                "Área de trabajo central con el módulo activo.",
                "Panel Inspector a la derecha (ficha de viaje/cotización o ayuda).",
                "Atajo Cmd/Ctrl+K: saltar a un módulo permitido.",
                "Atajo Cmd/Ctrl+/: abrir guía de 3 pasos del módulo.",
                "Esc: cerrar paneles.",
            ],
            st,
        )
    )
    story.append(PageBreak())

    # ——— 5 módulos ———
    story.append(p("5. Módulos del CRM web", st["h1"]))
    story.append(
        p(
            "A continuación, únicamente pantallas y acciones presentes en la aplicación.",
            st["body"],
        )
    )

    modules = [
        (
            "5.1 Inicio — Dashboard",
            [
                "KPIs: viajes activos, alertas/bloqueos y facturación CxC del mes.",
                "Accesos rápidos a Logística, Taller y Trámites.",
                "Apertura del centro de ayuda contextual.",
            ],
        ),
        (
            "5.2 Canales CRM — Apps",
            [
                "Vista de overview: canales, tickets abiertos y visitantes en sede (solo lectura).",
            ],
        ),
        (
            "5.3 Comercial",
            [
                "Clientes: alta (con chequeo SARLAFT en API) y edición.",
                "Cotizador: calcular tarifa por km, peajes, tipo de unidad y margen; guardar borrador.",
                "Cotizaciones: enviar, rechazar, marcar ganada; aprobar y generar viaje borrador; convertir a contrato.",
                "Contratos: alta (privado o licitación), edición y listado.",
            ],
        ),
        (
            "5.4 Operaciones — Logística",
            [
                "Crear viaje (cliente, contrato, vehículo, conductor, tarifa) usando el tablero de despacho (aptitud).",
                "Cambiar estado: en ruta, completar, cancelar.",
                "Reportar novedad en viaje.",
                "Facturar viaje completado → genera CxC.",
                "Alta y edición de conductores.",
                "Listado GPS y actualización manual; tiempo real por WebSocket.",
                "Inspector con ficha preoperacional del viaje.",
            ],
        ),
        (
            "5.5 Parqueadero",
            [
                "Check-in (placa, conductor, guarda).",
                "Check-out.",
                "Resumen operativo y bitácora (logs).",
            ],
        ),
        (
            "5.6 Trámites",
            [
                "Matriz de flota con semáforo verde / amarillo / rojo.",
                "Alta y edición de procedimientos (SOAT, tecnomecánica, tarjeta de operación, etc.).",
                "Cambio de estado documental.",
                "Filtros por aptitud / alertas con explicación operativa.",
            ],
        ),
        (
            "5.7 Taller",
            [
                "Alta y edición de vehículos.",
                "Crear órdenes de trabajo (OT).",
                "Avanzar OT: en progreso, espera de repuestos, finalizada.",
                "Al abrir OT el vehículo pasa a mantenimiento (regla de API).",
            ],
        ),
        (
            "5.8 Compras",
            [
                "Crear solicitudes de compra.",
                "Flujo: solicitada → aprobada → pedida → recibida.",
                "Cancelar orden.",
            ],
        ),
        (
            "5.9 Tesorería — Finanzas",
            [
                "Resumen CxC / CxP.",
                "Crear y editar facturas.",
                "En CxP: aprobar pago y marcar pagada (sujeto a SARLAFT).",
                "Anular factura.",
            ],
        ),
        (
            "5.10 Contabilidad",
            [
                "Plan de cuentas (PUC).",
                "Asientos de partida doble.",
                "Balance de prueba.",
                "Anular (void) asiento.",
            ],
        ),
        (
            "5.11 Revisoría fiscal",
            [
                "Registrar hallazgos.",
                "Cambiar estado del hallazgo.",
            ],
        ),
        (
            "5.12 Recursos humanos",
            [
                "Alta de personal por área.",
                "Edición de ficha.",
                "Cambio de estado laboral: activo, vacaciones, médico, inactivo.",
                "Visualización de score de fatiga (afecta despacho).",
            ],
        ),
        (
            "5.13 Call Center — Atención",
            [
                "Crear tickets (WhatsApp, email, teléfono, web, presencial).",
                "Editar ticket.",
                "Flujo: abierto → en progreso → resuelto → cerrado (con reapertura).",
            ],
        ),
        (
            "5.14 Calidad / HSQE",
            [
                "Registrar eventos NPS e incidentes.",
                "Actualizar estado.",
                "Consultar resumen.",
            ],
        ),
        (
            "5.15 Jurídico",
            [
                "Registrar documentos FUEC.",
                "Actualizar estado documental (válido / por vencer / vencido).",
            ],
        ),
        (
            "5.16 SARLAFT",
            [
                "Registrar chequeos de riesgo (bajo, medio, alto, bloqueado).",
                "Actualizar nivel de riesgo en listado.",
            ],
        ),
        (
            "5.17 Archivo",
            [
                "Cargar archivos con hash SHA-256.",
                "Clasificar por categoría, buscar por título/etiqueta/hash.",
                "Consultar auditoría y soft-delete.",
            ],
        ),
        (
            "5.18 Recepción",
            [
                "Check-in de visitantes.",
                "Checkout y edición de registro.",
            ],
        ),
        (
            "5.19 Sistemas",
            [
                "Health de API/base (latencia, uptime, conteos).",
                "Crear alertas de sistema y resolverlas.",
            ],
        ),
        (
            "5.20 Usuarios",
            [
                "Crear usuario con rol.",
                "Editar datos.",
                "Activar / desactivar cuenta.",
            ],
        ),
        (
            "5.21 Mi cuenta",
            [
                "Cambio de contraseña del usuario autenticado.",
            ],
        ),
    ]

    for title, items in modules:
        block = [p(title, st["h2"]), bullets(items, st)]
        story.append(KeepTogether(block))

    story.append(PageBreak())

    # ——— 6 ———
    story.append(p("6. App conductor", st["h1"]))
    story.append(
        p(
            "Aplicación móvil Expo / React Native vinculada al usuario tipo conductor.",
            st["body"],
        )
    )
    story.append(
        bullets(
            [
                "Login con las mismas credenciales JWT.",
                "Listado «Mis viajes» del conductor vinculado.",
                "Iniciar ruta: exige checklist preoperacional previamente sellado.",
                "Completar viaje y reportar novedad.",
                "Preoperacional: frenos, luces, llantas, kit, aceite + observaciones.",
                "GPS periódico (~12 s) mientras el viaje está en ruta con preoperacional válido.",
                "Cerrar sesión.",
            ],
            st,
        )
    )
    story.append(PageBreak())

    # ——— 7 ———
    story.append(p("7. Reglas duras (compliance, fatiga, documentos)", st["h1"]))
    story.append(
        p(
            "Estas reglas están codificadas en @fsg/shared y aplicadas por la API "
            "al asignar o poner un viaje en tránsito.",
            st["body"],
        )
    )
    story.append(
        table(
            ["Regla", "Valor", "Efecto operativo"],
            [
                ["Documentos por vencer", "≤ 15 días", "Semáforo amarillo (EXPIRING)"],
                ["Documento vencido", "Fecha pasada", "Semáforo rojo — bloquea despacho"],
                ["Fatiga máxima", "≥ 80", "Bloquea despacho"],
                ["Estados RRHH", "Médico / vacaciones / inactivo", "Bloquea despacho"],
                ["Estado vehículo", "Mantenimiento / fuera de servicio", "Bloquea despacho"],
                ["OT preventiva", "Cada 10.000 km", "Genera orden al cruzar umbral"],
                ["Distancia al cerrar", "45 km por defecto", "Si no se informa distanceKm"],
                ["Preoperacional", "Obligatorio", "Sin sello no hay IN_TRANSIT"],
            ],
            st,
            [3.5 * cm, 4.5 * cm, 8 * cm],
        )
    )
    story.append(Spacer(1, 0.3 * cm))
    story.append(p("Semáforo documental (SOAT, tecnomecánica, tarjeta de operación)", st["h2"]))
    story.append(
        table(
            ["Color", "Condición", "Significado"],
            [
                ["Verde", "Vigencia &gt; 15 días", "Apto para despacho"],
                ["Amarillo", "Vigencia ≤ 15 días", "Planificar renovación"],
                ["Rojo", "Vencido", "Bloqueo activo — no despachar"],
            ],
            st,
            [3 * cm, 5 * cm, 8 * cm],
        )
    )
    story.append(PageBreak())

    # ——— 8 ———
    story.append(p("8. SARLAFT y archivo documental", st["h1"]))
    story.append(p("SARLAFT", st["h2"]))
    story.append(
        bullets(
            [
                "Chequeos manuales con niveles: bajo, medio, alto, bloqueado.",
                "Riesgo ALTO o BLOQUEADO impide alta de cliente y pago de CxP.",
                "Override controlado (forceDespiteSarlaft) solo Presidencia/Finanzas, con AuditLog.",
            ],
            st,
        )
    )
    story.append(p("Archivo", st["h2"]))
    story.append(
        bullets(
            [
                "Upload real de archivos con huella SHA-256.",
                "Almacenamiento referenciado en /uploads/.",
                "Categorías, búsqueda y bitácora de auditoría.",
                "Eliminación lógica (soft-delete).",
            ],
            st,
        )
    )
    story.append(PageBreak())

    # ——— 9 ———
    story.append(p("9. Cotizador comercial y ciclo a viaje", st["h1"]))
    story.append(
        p(
            "El cotizador calcula tarifa en COP a partir de distancia, peajes, "
            "tipo de unidad y margen objetivo (por defecto 30%).",
            st["body"],
        )
    )
    story.append(
        bullets(
            [
                "Tipos de unidad: bus escolar, bus turismo, camión de carga, van.",
                "Costo operativo = (km × costoKm) + (peajes × 18.000) + pago conductor.",
                "Precio sugerido = costo operativo ÷ (1 − margen/100).",
                "Se muestra costo estimado, peajes, utilidad bruta y precio final.",
                "Guardar cotización en borrador con el desglose (calcJson).",
                "Estados usados: borrador, enviada, ganada, rechazada (y flujos de aprobación).",
                "Aprobar / marcar ganada genera viaje borrador TRP-XXXX en Logística.",
                "Convertir a contrato crea CTR-… y puede dejar viaje borrador.",
            ],
            st,
        )
    )
    story.append(PageBreak())

    # ——— 10 ———
    story.append(p("10. Preoperacional y despacho", st["h1"]))
    story.append(p("Preoperacional", st["h2"]))
    story.append(
        bullets(
            [
                "Checklist de cinco ítems: frenos, luces, llantas, kit, aceite.",
                "Observaciones libres.",
                "Se sella desde la app conductor (también visible en Inspector web).",
                "Sin preoperacional válido la API rechaza pasar el viaje a en ruta.",
            ],
            st,
        )
    )
    story.append(p("Despacho", st["h2"]))
    story.append(
        bullets(
            [
                "Tablero de despacho: readiness de vehículos y conductores.",
                "Matriz de flota en Trámites alineada al mismo semáforo.",
                "assertCanAssign valida documentos, fatiga, estado de unidad y personal.",
                "Viaje facturable al completar → factura CxC en tesorería.",
            ],
            st,
        )
    )
    story.append(PageBreak())

    # ——— 11 ———
    story.append(p("11. Credenciales de demostración", st["h1"]))
    story.append(
        p(
            "Organización seed: FSG Transportes S.A.S. (NIT 900123456-1). "
            "Contraseña común de todos los usuarios demo: <b>fsg2026</b>.",
            st["body"],
        )
    )
    story.append(
        table(
            ["Correo", "Nombre", "Rol / uso"],
            [
                ["ceo@fsg.co", "Ana CEO", "Presidencia"],
                ["ops@fsg.co", "Carlos Ops", "Gerencia"],
                ["fin@fsg.co", "María Finanzas", "Finanzas"],
                ["despacho@fsg.co", "Luis Despacho", "Despacho"],
                ["conductor@fsg.co", "Luis Pérez", "Despacho + app conductor"],
                ["rrhh@fsg.co", "Sofía RRHH", "RRHH"],
                ["atencion@fsg.co", "Pedro Atención", "Atención"],
                ["ti@fsg.co", "Diana Sistemas", "Sistemas"],
            ],
            st,
            [4.5 * cm, 4.5 * cm, 7 * cm],
        )
    )
    story.append(
        p(
            "El seed también carga clientes, cotizaciones, contratos, flota, viajes, "
            "OT, facturas, PUC, personal, tickets, calidad, FUEC, SARLAFT (incluye "
            "un caso bloqueado de prueba), archivo, visitantes, alertas, hallazgos, "
            "órdenes de compra, trámites y parqueadero.",
            st["note"],
        )
    )
    story.append(PageBreak())

    # ——— 12 ———
    story.append(p("12. Accesos técnicos (puertos)", st["h1"]))
    story.append(p("Entorno local", st["h2"]))
    story.append(
        table(
            ["Servicio", "Puerto"],
            [
                ["CRM web", "3000"],
                ["API", "4000"],
                ["PostgreSQL (host)", "55432"],
                ["Redis (host)", "56379"],
            ],
            st,
            [8 * cm, 8 * cm],
        )
    )
    story.append(p("Producción (Docker compose prod)", st["h2"]))
    story.append(
        table(
            ["Servicio", "Puerto host"],
            [
                ["CRM web", "3010"],
                ["API", "4010"],
                ["PostgreSQL", "127.0.0.1:55432 (opcional)"],
                ["Redis", "Solo red interna del compose"],
            ],
            st,
            [8 * cm, 8 * cm],
        )
    )
    story.append(Spacer(1, 1 * cm))
    story.append(
        p(
            "Fin del manual. Documento generado a partir del código implementado "
            "en el monorepo Fleetline — sin secciones de roadmap.",
            st["note"],
        )
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=1.8 * cm,
        title="Manual operativo Fleetline OS",
        author="Fleetline / FSG Transportes",
        subject="Manual formal de funciones implementadas",
    )
    doc.build(story, onFirstPage=_cover_page, onLaterPages=header_footer)
    print(f"OK: {OUT}")


def _cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 1.2 * cm, A4[0], 1.2 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawCentredString(A4[0] / 2, A4[1] - 0.75 * cm, "DOCUMENTO OPERATIVO — FLEETLINE OS")
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 1.2 * cm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(A4[0] / 2, 0.5 * cm, "Confidencial operativo · Solo funciones existentes")
    canvas.restoreState()


if __name__ == "__main__":
    build()
