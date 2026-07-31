#!/usr/bin/env python3
"""Manual de uso Fleetline OS — guía práctica para operar cada pantalla (sin jerga técnica)."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
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

OUT = Path(__file__).resolve().parents[1] / "docs" / "MANUAL_DE_USO_FLEETLINE_OS.pdf"

INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#64748B")
ACCENT = colors.HexColor("#0D9488")
SURFACE = colors.HexColor("#F4F6F9")
LINE = colors.HexColor("#E2E8F0")


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_brand": ParagraphStyle(
            "cover_brand", fontName="Helvetica-Bold", fontSize=26, textColor=ACCENT,
            alignment=TA_CENTER, spaceAfter=8,
        ),
        "cover_title": ParagraphStyle(
            "cover_title", fontName="Helvetica-Bold", fontSize=18, textColor=INK,
            alignment=TA_CENTER, spaceAfter=6, leading=24,
        ),
        "cover_sub": ParagraphStyle(
            "cover_sub", fontName="Helvetica", fontSize=11, textColor=MUTED,
            alignment=TA_CENTER, leading=15, spaceAfter=4,
        ),
        "h1": ParagraphStyle(
            "h1", fontName="Helvetica-Bold", fontSize=15, textColor=INK,
            spaceBefore=2, spaceAfter=8,
        ),
        "h2": ParagraphStyle(
            "h2", fontName="Helvetica-Bold", fontSize=11.5, textColor=ACCENT,
            spaceBefore=10, spaceAfter=5,
        ),
        "h3": ParagraphStyle(
            "h3", fontName="Helvetica-Bold", fontSize=10, textColor=INK,
            spaceBefore=7, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=9.5, textColor=INK,
            alignment=TA_JUSTIFY, leading=13, spaceAfter=5,
        ),
        "step": ParagraphStyle(
            "step", fontName="Helvetica", fontSize=9.5, textColor=INK, leading=13,
        ),
        "tip": ParagraphStyle(
            "tip", fontName="Helvetica-Oblique", fontSize=8.5, textColor=MUTED,
            leading=11, spaceBefore=2, spaceAfter=6,
        ),
        "toc": ParagraphStyle(
            "toc", fontName="Helvetica", fontSize=10, textColor=INK, leading=16,
        ),
        "table_cell": ParagraphStyle(
            "table_cell", fontName="Helvetica", fontSize=8.5, textColor=INK, leading=11,
        ),
        "table_head": ParagraphStyle(
            "table_head", fontName="Helvetica-Bold", fontSize=8.5,
            textColor=colors.white, leading=11,
        ),
    }


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, A4[1] - 1.4 * cm, A4[0] - 2 * cm, A4[1] - 1.4 * cm)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(2 * cm, A4[1] - 1.1 * cm, "Fleetline OS — Manual de uso")
    canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 1.1 * cm, "Cómo operar cada pantalla")
    canvas.line(2 * cm, 1.3 * cm, A4[0] - 2 * cm, 1.3 * cm)
    canvas.drawCentredString(A4[0] / 2, 0.8 * cm, f"Página {doc.page}")
    canvas.restoreState()


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.rect(0, A4[1] - 1.2 * cm, A4[0], 1.2 * cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawCentredString(A4[0] / 2, A4[1] - 0.75 * cm, "MANUAL DE USO — PARA OPERADORES")
    canvas.setFillColor(LINE)
    canvas.rect(0, 0, A4[0], 1.2 * cm, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(A4[0] / 2, 0.5 * cm, "Paso a paso · Sin jerga técnica · Solo pantallas existentes")
    canvas.restoreState()


def P(text, style):
    return Paragraph(text, style)


def steps(items, st):
    flow = []
    for i, item in enumerate(items, 1):
        flow.append(ListItem(Paragraph(f"<b>Paso {i}.</b> {item}", st["step"]), leftIndent=6))
    return ListFlowable(flow, bulletType="bullet", start="•", leftIndent=10, spaceAfter=6)


def bullets(items, st):
    return ListFlowable(
        [ListItem(Paragraph(i, st["step"]), leftIndent=6) for i in items],
        bulletType="bullet", start="•", leftIndent=10, spaceAfter=6,
    )


def table(headers, rows, st, widths):
    data = [[Paragraph(h, st["table_head"]) for h in headers]]
    for row in rows:
        data.append([Paragraph(str(c), st["table_cell"]) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, SURFACE]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


def screen(story, st, title, where, see, how, tips=None):
    block = [
        P(title, st["h2"]),
        P(f"<b>Dónde encontrarla:</b> {where}", st["body"]),
        P("<b>Qué vas a ver:</b>", st["h3"]),
        bullets(see, st),
        P("<b>Cómo usarla:</b>", st["h3"]),
        steps(how, st),
    ]
    if tips:
        block.append(P(f"<b>Ojo:</b> {tips}", st["tip"]))
    story.append(KeepTogether(block))


def build():
    st = styles()
    story = []

    # Portada
    story.append(Spacer(1, 4 * cm))
    story.append(P("FLEETLINE OS", st["cover_brand"]))
    story.append(P("Manual de uso del CRM", st["cover_title"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(P(
        "Cómo entrar, navegar y trabajar en cada pantalla:<br/>"
        "qué pulsar, qué llenar y qué pasa después.",
        st["cover_sub"],
    ))
    story.append(Spacer(1, 1 * cm))
    meta = Table([
        ["Para quién", "Despacho, comercial, finanzas, RRHH, atención, gerencia y TI"],
        ["Cómo leerlo", "Cada capítulo = una pantalla. Pasos numerados."],
        ["Versión", "1.0 — Julio 2026"],
        ["Demo", "Contraseña de prueba: fsg2026 (usuarios @fsg.co)"],
    ], colWidths=[3.5 * cm, 11.5 * cm])
    meta.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(meta)
    story.append(PageBreak())

    # Índice
    story.append(P("Contenido", st["h1"]))
    for item in [
        "1. Entrar al sistema",
        "2. Moverse por el CRM (menú, búsqueda, ayuda)",
        "3. Inicio operativo",
        "4. Comercial: clientes, cotizador, cotizaciones y contratos",
        "5. Logística: conductores, viajes y GPS",
        "6. Parqueadero",
        "7. Trámites y semáforo de flota",
        "8. Taller y órdenes de trabajo",
        "9. Compras",
        "10. Tesorería (cobrar y pagar)",
        "11. Contabilidad",
        "12. Revisoría, RRHH, Call center y Calidad",
        "13. Jurídico, SARLAFT y Archivo",
        "14. Recepción, Sistemas, Usuarios y Mi cuenta",
        "15. App del conductor (móvil)",
        "16. Flujo completo de un viaje (de punta a punta)",
        "17. Usuarios de demostración",
    ]:
        story.append(P(item, st["toc"]))
    story.append(PageBreak())

    # 1 Login
    story.append(P("1. Entrar al sistema", st["h1"]))
    story.append(P(
        "Abre la dirección del CRM en el navegador. Verás la pantalla "
        "<b>ACCESO A TORRE DE CONTROL</b> con la marca FLEETLINE OS.",
        st["body"],
    ))
    story.append(P("Iniciar sesión", st["h2"]))
    story.append(steps([
        "En <b>Identificador de nodo</b> escribe tu correo (ejemplo: despacho@fsg.co).",
        "En <b>Clave de acceso</b> escribe tu contraseña.",
        "Pulsa <b>Autenticar</b>.",
        "El sistema te lleva al Inicio operativo (o a la pantalla principal de tu rol).",
    ], st))
    story.append(P("Registrar una empresa nueva (solo si aplica)", st["h2"]))
    story.append(steps([
        "Pulsa <b>Registrar nodo organizacional</b>.",
        "Llena Organización, NIT, nombre del administrador, correo y clave.",
        "Pulsa <b>Provisionar y entrar</b>.",
    ], st))
    story.append(P(
        "Si las credenciales fallan verás un aviso de nodo no encontrado. "
        "Puedes cambiar entre tema Claro y Oscuro desde esta misma pantalla.",
        st["tip"],
    ))
    story.append(PageBreak())

    # 2 Shell
    story.append(P("2. Moverse por el CRM", st["h1"]))
    story.append(P("Menú de departamentos (izquierda)", st["h2"]))
    story.append(P(
        "El menú no lista 20 botones sueltos: agrupa pantallas por área. "
        "Puedes tener varios departamentos abiertos a la vez.",
        st["body"],
    ))
    story.append(table(
        ["Departamento", "Pantallas que encontrarás"],
        [
            ["Operaciones y flota", "Logística y GPS · Parqueadero · Trámites"],
            ["Comercial y clientes", "Cotizaciones y contratos · Clientes · Canales CRM"],
            ["Mantenimiento y taller", "Órdenes de trabajo · Inventario / compras"],
            ["Finanzas y gobierno", "Tesorería · Contabilidad · Archivo · SARLAFT · Calidad · Revisoría · Jurídico"],
            ["Personas y mando", "Inicio · RRHH · Call center · Recepción · Sistemas · Usuarios · Mi cuenta"],
        ],
        st, [4.5 * cm, 11.5 * cm],
    ))
    story.append(Spacer(1, 0.25 * cm))
    story.append(bullets([
        "Clic en el nombre del departamento para abrir o cerrar sus pantallas.",
        "Clic en una pantalla para entrar.",
        "Abajo del menú: <b>Cerrar sesión</b>.",
        "En móvil usa el menú hamburguesa.",
    ], st))
    story.append(P("Barra superior", st["h2"]))
    story.append(bullets([
        "<b>Buscar…</b> (o teclas Ctrl+K / Cmd+K): escribe el nombre de un módulo y entra rápido.",
        "<b>?</b> (o Ctrl+/ / Cmd+/): abre la asistencia con 3 pasos del módulo actual.",
        "Interruptor <b>Claro / Oscuro</b> para el tema visual.",
        "<b>SYSTEM STATUS</b>: NOMINAL (todo bien), ALERT o OFFLINE.",
        "Chip con tu nombre y rol a la derecha.",
    ], st))
    story.append(P(
        "El panel <b>Inspector</b> (derecha) se abre al hacer clic en una fila "
        "(viaje o cotización). Cierra con la X o con Esc.",
        st["tip"],
    ))
    story.append(PageBreak())

    # 3 Dashboard
    story.append(P("3. Inicio operativo", st["h1"]))
    screen(
        story, st,
        "Pantalla de bienvenida del día",
        "Personas y mando → Inicio operativo",
        [
            "Saludo con tu nombre y el estado del día.",
            "Tres números grandes: Viajes activos, Alertas / bloqueos, Facturación del mes.",
            "Botones de acciones rápidas.",
        ],
        [
            "Revisa los tres indicadores para saber si hay bloqueos o mucho trabajo en curso.",
            "Pulsa <b>Crear nuevo viaje</b> para ir a Logística.",
            "Pulsa <b>Registrar mantenimiento</b> para ir a Taller.",
            "Pulsa <b>Consultar vehículo</b> para ir a Trámites.",
            "Pulsa <b>Ver mapa en vivo</b> para ir a Logística (GPS).",
            "Usa el botón <b>?</b> si necesitas la guía corta del cockpit.",
        ],
        "Si el indicador de alertas está en rojo o ámbar, ve primero a Trámites o Logística.",
    )
    story.append(PageBreak())

    # 4 Comercial
    story.append(P("4. Comercial: clientes, cotizador, cotizaciones y contratos", st["h1"]))
    story.append(P(
        "Menú: <b>Comercial y clientes</b> → Cotizaciones y contratos / Clientes / B2B.",
        st["body"],
    ))

    screen(
        story, st, "Crear un cliente",
        "Misma pantalla Comercial (bloque de clientes)",
        ["Formulario de alta y tabla de clientes existentes."],
        [
            "Escribe Nombre, NIT y elige segmento (Empresa, Colegio o Turismo).",
            "Pulsa <b>Crear cliente</b>.",
            "Para corregir datos usa <b>Editar</b> en la fila del cliente.",
        ],
        "Si el NIT está en SARLAFT con riesgo alto o bloqueado, el alta puede fallar. "
        "Revisa primero el módulo SARLAFT.",
    )

    screen(
        story, st, "Cotizador inteligente",
        "Pantalla Comercial — bloque Cotizador",
        [
            "Campos de ruta, tipo de unidad, kilómetros, peajes y margen.",
            "Desglose en vivo: costo, peajes, utilidad y precio sugerido.",
        ],
        [
            "Elige el cliente.",
            "Escribe Origen y Destino.",
            "Elige tipo de unidad (bus escolar, turismo, camión o van).",
            "Indica kilómetros y cantidad de peajes.",
            "Ajusta el Margen % si quieres (por defecto 30).",
            "Revisa el precio sugerido.",
            "Pulsa <b>Guardar cotización</b> (o <b>Recalcular</b> si cambiaste datos).",
        ],
    )

    screen(
        story, st, "Gestionar cotizaciones",
        "Tabla Cotizaciones en Comercial",
        ["Lista de cotizaciones con acciones por fila."],
        [
            "Pulsa <b>Detalle</b> para abrir el Inspector con el desglose.",
            "Pulsa <b>Enviar</b> cuando la cotización esté lista para el cliente.",
            "Pulsa <b>Aprobar → Viaje</b> (o en el Inspector <b>APROBAR Y CONVERTIR A VIAJE</b>) "
            "para crear un viaje borrador en Logística.",
            "Pulsa <b>→ Contrato</b> si quieres convertirla en contrato.",
            "Usa <b>Rechazar</b> si no procede.",
        ],
    )

    screen(
        story, st, "Crear y manejar un contrato",
        "Bloque de contratos en Comercial",
        ["Formulario de contrato y tabla Contratos operativos."],
        [
            "Llena nombre, cliente, canal (Empresa privada o Licitación pública), "
            "ruta, fechas y valor.",
            "Pulsa <b>Crear contrato operativo</b>.",
            "Después puedes <b>Activar</b>, <b>Suspender</b>, <b>Cerrar</b> o <b>Editar</b>.",
        ],
    )
    story.append(PageBreak())

    # 5 Logística
    story.append(P("5. Logística: conductores, viajes y GPS", st["h1"]))
    story.append(P(
        "Menú: <b>Operaciones y flota</b> → Logística y GPS en vivo.",
        st["body"],
    ))

    screen(
        story, st, "Dar de alta un conductor",
        "Bloque de conductores en Logística",
        ["Formulario y lista de conductores."],
        [
            "Escribe Nombre, Documento, Teléfono y Licencia.",
            "Pulsa <b>Alta conductor</b>.",
            "Usa <b>Activar/Desactivar</b> según disponibilidad.",
        ],
    )

    screen(
        story, st, "Crear un viaje",
        "Formulario de viaje + selector de unidad/conductor",
        [
            "Campos de ruta, valor, cliente, contrato, vehículo y conductor.",
            "En los selectores verás si la unidad o el conductor están OK o bloqueados.",
        ],
        [
            "Llena Origen, Destino, fecha/hora y Valor del viaje en COP.",
            "Elige Cliente y, si aplica, Contrato.",
            "Elige Vehículo: evita los marcados <b>BLOQUEADO</b> o <b>por vencer</b>.",
            "Elige Conductor: evita los <b>NO DISPONIBLE</b>.",
            "Pulsa <b>Crear viaje</b>.",
        ],
        "Si el vehículo tiene SOAT/tecnomecánica vencidos, fatiga alta o está en taller, "
        "el sistema no permite despacharlo.",
    )

    screen(
        story, st, "Controlar el viaje en la tabla",
        "Tabla Viajes (pestañas Todos / En ruta / Alertas)",
        [
            "Lista de viajes con botones de acción.",
            "Búsqueda por texto.",
        ],
        [
            "Filtra con las pestañas según lo que necesites ver.",
            "Clic en la fila → abre el Inspector (ficha preoperacional).",
            "Pulsa <b>Preop.</b> para revisar la inspección.",
            "Pulsa <b>En vía</b> cuando el viaje deba ir en ruta "
            "(en la práctica el conductor lo inicia desde la app tras firmar preoperacional).",
            "Pulsa <b>Novedad</b> para registrar un incidente en ruta.",
            "Pulsa <b>Cerrar</b> al terminar el servicio.",
            "Si el viaje está Terminado, pulsa <b>Facturar</b> para crear la cuenta por cobrar.",
            "Usa <b>Cancelar</b> solo si el viaje no se realizará.",
        ],
    )

    screen(
        story, st, "Ver y actualizar GPS",
        "Panel Posiciones GPS",
        ["Lista de posiciones y estado En vivo / desactualizado."],
        [
            "Revisa el panel para ver dónde está cada unidad.",
            "Si necesitas forzar una posición: elige vehículo, latitud y longitud → "
            "<b>Actualizar GPS</b>.",
        ],
        "Mientras el viaje esté en ruta con preoperacional firmado, la app del conductor "
        "envía GPS sola aproximadamente cada 12 segundos.",
    )
    story.append(PageBreak())

    # 6 Parqueadero
    story.append(P("6. Parqueadero", st["h1"]))
    screen(
        story, st, "Control de patio",
        "Operaciones y flota → Parqueadero y patio",
        [
            "Números: Vehículos en patio e Ingresos hoy.",
            "Formulario de ingreso y tabla con filtro Todos / En patio / Con salida.",
        ],
        [
            "Escribe Placa, Conductor y Guarda.",
            "Pulsa <b>Registrar ingreso</b>. El vehículo queda <b>EN PATIO</b>.",
            "Cuando salga, en esa fila pulsa <b>Check-out</b>. Queda <b>SALIDA</b>.",
        ],
    )

    # 7 Trámites
    story.append(P("7. Trámites y semáforo de flota", st["h1"]))
    screen(
        story, st, "Interpretar el semáforo",
        "Operaciones y flota → Trámites y documentación",
        [
            "Contadores Verde / Amarillo / Rojo.",
            "Tabla Semáforo de flota con pestañas Todos / Aptos / Alertas / bloqueados.",
            "Formulario para registrar un trámite y tabla de documentos.",
        ],
        [
            "Mira primero los contadores: el rojo son unidades que no puedes despachar.",
            "Usa la pestaña <b>Alertas / bloqueados</b> para priorizar renovaciones.",
            "Para registrar un documento: elige vehículo, tipo (SOAT, Tecnomecánica, etc.), "
            "referencia y fecha → <b>Registrar trámite</b>.",
            "En la fila del documento usa <b>Renovar</b>, <b>Vigente</b> o <b>Vencido</b> según corresponda.",
        ],
        "Verde = apto (más de 15 días). Amarillo = por vencer (15 días o menos). "
        "Rojo = vencido y bloquea despacho en Logística.",
    )
    story.append(PageBreak())

    # 8 Taller
    story.append(P("8. Taller y órdenes de trabajo", st["h1"]))
    screen(
        story, st, "Flota y OT",
        "Mantenimiento y taller → Órdenes de trabajo",
        ["Alta de vehículo, abrir OT, tablas Flota y Órdenes de trabajo."],
        [
            "Alta de unidad: Placa, Marca, Modelo, Año, Capacidad → <b>Alta vehículo</b>.",
            "Abrir mantenimiento: elige vehículo + descripción → <b>Abrir orden de taller</b>. "
            "La unidad pasa a estado de taller.",
            "En la OT: <b>En curso</b> → si falta material <b>Repuestos</b> → al terminar <b>Cerrar</b>.",
            "Al cerrar, la unidad vuelve a disponible (si no hay otro bloqueo).",
        ],
        "Un vehículo en taller no se puede despachar hasta cerrar la orden.",
    )

    # 9 Compras
    story.append(P("9. Compras", st["h1"]))
    screen(
        story, st, "Solicitar y recibir compras",
        "Mantenimiento y taller → Inventario / compras",
        ["Formulario de solicitud y tabla de órdenes."],
        [
            "Llena Descripción, Proveedor, Valor y categoría → <b>Nueva solicitud</b>.",
            "Cuando se autorice: <b>→ Aprobada</b>.",
            "Cuando se pida al proveedor: <b>→ Pedida</b>.",
            "Cuando llegue: <b>→ Recibida</b> (se genera factura por pagar en Tesorería).",
            "Si no procede: <b>Cancelar</b>.",
        ],
    )
    story.append(PageBreak())

    # 10 Finanzas
    story.append(P("10. Tesorería (cobrar y pagar)", st["h1"]))
    screen(
        story, st, "Cuentas por cobrar y por pagar",
        "Finanzas y gobierno → Tesorería (CxC / CxP)",
        [
            "KPIs: Por cobrar, Ya cobrado, Por pagar, Vencidas.",
            "Formulario de factura y tabla Facturas.",
        ],
        [
            "Elige tipo <b>Por cobrar</b> o <b>Por pagar</b>.",
            "Llena contraparte, monto y vencimiento → <b>Registrar factura</b>.",
            "También puedes generar CxC desde Logística con <b>Facturar</b> en un viaje terminado.",
            "Usa <b>Editar</b> si hay que corregir.",
            "Para cobrar/pagar: <b>Marcar pagada</b> o <b>Aprobar y pagar</b> en CxP.",
            "Si ya no aplica: <b>Anular</b>.",
        ],
        "Un pago a un tercero con SARLAFT alto o bloqueado puede quedar detenido. "
        "Revisa SARLAFT antes de insistir.",
    )

    # 11 Contabilidad
    story.append(P("11. Contabilidad", st["h1"]))
    screen(
        story, st, "Cuentas, asientos y balance",
        "Finanzas y gobierno → Contabilidad",
        [
            "Crear cuenta PUC, publicar asiento, Balance de prueba, lista de asientos.",
        ],
        [
            "Nueva cuenta: Código, Nombre y tipo → <b>Crear cuenta</b>.",
            "Nuevo asiento: descripción, cuenta Débito, cuenta Crédito y valor → "
            "<b>Publicar asiento</b> (débito y crédito deben cuadrar).",
            "Revisa el <b>Balance de prueba</b> y el símbolo Δ (debe quedar en cero).",
            "Si un asiento está mal: <b>Anular</b> (confirma cuando te lo pida).",
        ],
    )
    story.append(PageBreak())

    # 12 varios
    story.append(P("12. Revisoría, RRHH, Call center y Calidad", st["h1"]))

    screen(
        story, st, "Revisoría fiscal",
        "Finanzas y gobierno → Revisoría fiscal",
        ["Formulario de hallazgo y tarjetas por caso."],
        [
            "Escribe Título, severidad (Baja/Media/Alta), Detalle y Monto.",
            "Pulsa <b>Registrar hallazgo</b>.",
            "Cuando se resuelva: <b>Cerrar</b>.",
        ],
    )

    screen(
        story, st, "Recursos humanos",
        "Personas y mando → Recursos humanos",
        ["Alta de persona y tabla con Fatiga y Estado."],
        [
            "Llena Nombre, Documento, Cargo y Área → <b>Alta</b>.",
            "Pulsa <b>Editar ficha</b>, corrige y <b>Guardar</b> (o Cancelar).",
            "Cambia el estado laboral: activo, vacaciones, médico o inactivo.",
        ],
        "Si la persona está en médico, vacaciones o inactivo, o tiene fatiga alta, "
        "no se podrá despachar como conductor.",
    )

    screen(
        story, st, "Call center",
        "Personas y mando → Call center",
        ["Crear ticket y lista de tickets con canal y prioridad."],
        [
            "Escribe Asunto, Solicitante, canal (WhatsApp, Email, Teléfono, Web) y Mensaje.",
            "Pulsa <b>Crear ticket</b>.",
            "Asigna prioridad y agente si aplica.",
            "Flujo típico: <b>Tomar</b> → <b>Resolver</b> → <b>Cerrar</b>. Usa <b>Reabrir</b> si vuelve.",
        ],
    )

    screen(
        story, st, "Calidad / incidentes",
        "Finanzas y gobierno → Calidad / incidentes",
        ["KPIs NPS/Eventos/Abiertos e incidente; formulario y tabla."],
        [
            "Elige tipo (NPS, Incidente o Auditoría), escribe Título → <b>Registrar</b>.",
            "Al cerrar el caso: <b>Cerrar</b>.",
        ],
    )
    story.append(PageBreak())

    # 13
    story.append(P("13. Jurídico, SARLAFT y Archivo", st["h1"]))

    screen(
        story, st, "Jurídico / FUEC",
        "Finanzas y gobierno → Jurídico / FUEC",
        ["Alta de FUEC y tabla con estado documental."],
        [
            "Escribe Número FUEC, Contratante, Ruta y fechas → <b>Registrar FUEC</b>.",
            "Corrige ruta o vencimiento al salir del campo (edición rápida).",
            "Revisa si aparece Vigente, Por vencer o Vencido.",
        ],
    )

    screen(
        story, st, "SARLAFT",
        "Finanzas y gobierno → SARLAFT",
        ["Formulario de chequeo y tabla de riesgos."],
        [
            "Escribe Nombre/razón social, Documento/NIT, elige riesgo "
            "(Bajo, Medio, Alto, Bloqueado) y Notas.",
            "Pulsa <b>Registrar chequeo</b>.",
            "Si cambia la evaluación, actualiza el riesgo en el selector de la fila.",
        ],
        "Alto o Bloqueado detienen altas de cliente y pagos CxP. Úsalo con criterio.",
    )

    screen(
        story, st, "Archivo digital",
        "Finanzas y gobierno → Archivo digital",
        [
            "Subida de documentos, expediente con búsqueda y Auditoría de bóveda.",
        ],
        [
            "Escribe Título, elige categoría, adjunta archivo y Tags si aplica.",
            "Pulsa <b>Sellar e indexar</b> (con archivo) o <b>Indexar sin archivo</b> (solo ficha).",
            "Usa la búsqueda por título, etiqueta o huella.",
            "Pulsa <b>Abrir</b>, <b>Editar</b> o <b>Eliminar</b> según necesites.",
            "Revisa <b>Auditoría de bóveda</b> para ver quién hizo qué.",
        ],
        "Al sellar verás el mensaje DOCUMENTO SELLADO · HASH NOMINAL: el archivo quedó "
        "registrado con huella única.",
    )
    story.append(PageBreak())

    # 14
    story.append(P("14. Recepción, Sistemas, Usuarios y Mi cuenta", st["h1"]))

    screen(
        story, st, "Recepción de visitantes",
        "Personas y mando → Recepción",
        ["Check-in y tabla EN SEDE / SALIDA."],
        [
            "Llena Nombre, Documento, Empresa, Motivo y Anfitrión → <b>Check-in</b>.",
            "Al salir: <b>Check-out</b>.",
            "Corrige con <b>Editar</b> → <b>Guardar</b>.",
        ],
    )

    screen(
        story, st, "Sistemas / NOC",
        "Personas y mando → Sistemas / NOC",
        ["Salud de API y base, usuarios activos, uptime; alertas."],
        [
            "Revisa que API y Base de datos estén en orden.",
            "Para registrar un incidente: severidad + Fuente + Mensaje → <b>Crear alerta</b>.",
            "Cuando se atienda: <b>Resolver</b>.",
        ],
    )

    screen(
        story, st, "Usuarios",
        "Personas y mando → Usuarios (solo Presidencia o Sistemas)",
        ["Crear usuario y Directorio."],
        [
            "Llena Nombre, Email, Password y Rol → <b>Crear usuario</b>.",
            "Cambia nombre/email o rol desde la fila.",
            "Usa <b>Reset clave</b> si olvidó la contraseña.",
            "Usa <b>Desactivar</b> / <b>Reactivar</b> para controlar el acceso.",
        ],
        "Si ves «Sin permiso», tu rol no puede administrar usuarios.",
    )

    screen(
        story, st, "Mi cuenta",
        "Personas y mando → Mi cuenta",
        ["Tu nombre, correo y cambio de clave."],
        [
            "Escribe Contraseña actual y Nueva (mínimo 6 caracteres).",
            "Pulsa <b>Guardar contraseña</b>.",
            "Para salir del sistema usa <b>Cerrar sesión</b> en el menú izquierdo.",
        ],
    )

    # Canales CRM breve
    story.append(P("Canales CRM (consulta)", st["h2"]))
    story.append(P(
        "En <b>Comercial y clientes → Canales CRM</b> solo consultas resumen de canales, "
        "tickets abiertos y visitantes en sede. No hay formularios de creación aquí.",
        st["body"],
    ))
    story.append(PageBreak())

    # 15 Conductor
    story.append(P("15. App del conductor (móvil)", st["h1"]))
    story.append(P(
        "Es la app del teléfono del conductor (no es una pantalla del CRM web).",
        st["body"],
    ))
    story.append(P("Entrar", st["h2"]))
    story.append(steps([
        "Abre la app Fleetline Conductor.",
        "Escribe Email y Contraseña (ejemplo: conductor@fsg.co / fsg2026).",
        "Pulsa <b>Entrar</b>.",
    ], st))

    story.append(P("Mis viajes", st["h2"]))
    story.append(steps([
        "Verás la lista de viajes asignados a ti (código, estado, ruta, placa).",
        "Si dice <b>Requiere inspección preoperacional</b>, primero haz la inspección.",
        "Pulsa <b>Inspección preop.</b> o <b>Ver / iniciar ruta</b>.",
    ], st))

    story.append(P("Inspección preoperacional", st["h2"]))
    story.append(steps([
        "Revisa cada ítem: Frenos, Luces, Llantas, Kit de carretera, Nivel de aceite.",
        "Marca <b>APTO</b> o <b>NO APTO</b> en cada uno.",
        "Escribe Observaciones si hace falta.",
        "Si todo está APTO, pulsa <b>FIRMAR Y ENVIAR PREOPERACIONAL</b>.",
        "Cuando aparezca el mensaje de aprobado, pulsa <b>INICIAR RUTA</b>.",
    ], st))
    story.append(P(
        "Si falta la inspección, la app bloquea el inicio con el mensaje de preoperacional requerido. "
        "Con la ruta iniciada verás el aviso de GPS activo.",
        st["tip"],
    ))

    story.append(P("Durante y al final del viaje", st["h2"]))
    story.append(steps([
        "Para reportar un problema: <b>Novedad</b> → escribe el texto → <b>Enviar</b>.",
        "Al terminar el servicio: <b>Cerrar</b>.",
        "Para salir de la app: <b>Salir</b> en la cabecera.",
    ], st))
    story.append(PageBreak())

    # 16 Flujo punta a punta
    story.append(P("16. Flujo completo de un viaje (de punta a punta)", st["h1"]))
    story.append(P(
        "Este es el recorrido habitual cuando todo el equipo trabaja junto:",
        st["body"],
    ))
    story.append(steps([
        "Comercial crea o confirma el cliente (y, si aplica, cotiza y aprueba → viaje o contrato).",
        "Trámites confirma que la unidad está en verde (documentos al día).",
        "RRHH / conductores: el conductor está activo y sin fatiga crítica.",
        "Despacho en Logística crea el viaje con unidad y conductor aptos.",
        "El conductor abre la app → firma preoperacional → <b>INICIAR RUTA</b>.",
        "Torre de control ve el viaje En ruta y el GPS en Logística.",
        "Si hay incidente: el conductor reporta Novedad (o despacho desde web).",
        "Al terminar: se cierra el viaje (app o web).",
        "Tesorería: se factura el viaje (botón Facturar) y se gestiona el cobro.",
        "Si hace falta evidencia: se sube al Archivo digital.",
    ], st))
    story.append(P(
        "Si en cualquier punto el semáforo está rojo, la unidad está en taller "
        "o el conductor no está disponible, detente y corrige ese módulo antes de forzar el despacho.",
        st["tip"],
    ))
    story.append(PageBreak())

    # 17 Credenciales
    story.append(P("17. Usuarios de demostración", st["h1"]))
    story.append(P(
        "Organización de prueba: FSG Transportes. Contraseña de todos: <b>fsg2026</b>.",
        st["body"],
    ))
    story.append(table(
        ["Correo", "Para practicar…"],
        [
            ["ceo@fsg.co", "Ver todo el CRM (Presidencia)"],
            ["ops@fsg.co", "Operaciones y gerencia de flota"],
            ["fin@fsg.co", "Tesorería, contabilidad, SARLAFT, archivo"],
            ["despacho@fsg.co", "Crear viajes y ver GPS"],
            ["conductor@fsg.co", "App móvil del conductor"],
            ["rrhh@fsg.co", "Personal y fatiga"],
            ["atencion@fsg.co", "Call center y recepción"],
            ["ti@fsg.co", "Sistemas y usuarios"],
        ],
        st, [5.5 * cm, 10.5 * cm],
    ))
    story.append(Spacer(1, 1 * cm))
    story.append(P(
        "Fin del manual de uso. Si una pantalla no aparece en tu menú, "
        "es porque tu rol no la tiene asignada: pide acceso a Presidencia o Sistemas.",
        st["tip"],
    ))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=1.8 * cm,
        title="Manual de uso Fleetline OS",
        author="Fleetline / FSG Transportes",
        subject="Guía práctica para operar cada pantalla del CRM",
    )
    doc.build(story, onFirstPage=cover_page, onLaterPages=header_footer)
    print(f"OK: {OUT}")


if __name__ == "__main__":
    build()
