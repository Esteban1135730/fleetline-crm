import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const FORBIDDEN_SQL =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|execute|merge|replace|attach|detach|pragma|vacuum)\b/i;

/** Tablas permitidas para Text-to-SQL de solo lectura (whitelist). */
export const READ_ONLY_TABLES = [
  "Trip",
  "Vehicle",
  "Driver",
  "ComplianceDocument",
  "Route",
  "RouteExpense",
  "Invoice",
  "PaymentSchedule",
  "ThreeWayMatch",
  "PurchaseOrder",
  "JournalEntry",
  "JournalLine",
  "Account",
  "AuditLog",
] as const;

export function buildSchemaContext(): string {
  return [
    "Fleetline PostgreSQL (Prisma) — solo SELECT.",
    "Tablas: " + READ_ONLY_TABLES.join(", "),
    "Trip(id, code, origin, destination, departAt, status, fareAmount, vehicleId, organizationId)",
    "Vehicle(id, plate, complianceBlocked, status, organizationId)",
    "ComplianceDocument(id, type, status, expiresAt, vehicleId, organizationId) — type incluye SOAT",
    "PaymentSchedule(id, amount, status, dueDate, organizationId)",
    "ThreeWayMatch(id, status, organizationId) — DISCREPANCY_REJECTED / APPROVED",
    "JournalEntry / JournalLine / Account — NIIF módulo 10",
    "Filtrar SIEMPRE por organizationId = $ORG_ID.",
    "No usar JOINs a User.passwordHash ni tablas de auth mutables.",
  ].join("\n");
}

export function assertReadOnlySql(sql: string): string {
  const normalized = sql.trim().replace(/;+\s*$/g, "");
  if (!/^\s*select\b/i.test(normalized)) {
    throw new BadRequestException({
      error: "SQL_NOT_READONLY",
      message: "Solo se permiten consultas SELECT",
    });
  }
  if (FORBIDDEN_SQL.test(normalized)) {
    throw new BadRequestException({
      error: "SQL_FORBIDDEN_KEYWORD",
      message: "SQL contiene operaciones no permitidas en modo directiva",
    });
  }
  if (normalized.includes(";")) {
    throw new BadRequestException({
      error: "SQL_MULTI_STATEMENT",
      message: "Multi-statement SQL bloqueado",
    });
  }
  return normalized;
}

/**
 * Asistente Text-to-SQL (Gemini Pro cuando hay GEMINI_API_KEY; fallback heurístico).
 */
@Injectable()
export class TextToSqlAssistantService {
  private readonly logger = new Logger(TextToSqlAssistantService.name);

  constructor(private prisma: PrismaService) {}

  schemaContext() {
    return buildSchemaContext();
  }

  /**
   * Traduce pregunta NL → SQL de solo lectura + respuesta textual.
   * No ejecuta DML; ejecución analítica opcional vía SELECT validado.
   */
  async ask(input: {
    organizationId: string;
    userId: string;
    question: string;
  }) {
    const question = String(input.question || "").trim();
    if (question.length < 3) {
      throw new BadRequestException("Pregunta demasiado corta");
    }

    const schemaContext = buildSchemaContext();
    const { sql, answerText, engine } = await this.translate(
      question,
      input.organizationId,
      schemaContext,
    );

    const safeSql = assertReadOnlySql(sql);

    const log = await this.prisma.executiveQueryLog.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        utterance: question,
        generatedSql: safeSql,
        answerText,
      },
    });

    return {
      id: log.id,
      engine,
      schemaContextPreview: schemaContext.slice(0, 400),
      sql: safeSql,
      answer: answerText,
      readOnly: true,
    };
  }

  private async translate(
    question: string,
    organizationId: string,
    schemaContext: string,
  ): Promise<{ sql: string; answerText: string; engine: string }> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (apiKey) {
      try {
        return await this.callGemini(question, organizationId, schemaContext, apiKey);
      } catch (err) {
        this.logger.warn(
          `Gemini uplink falló — fallback heurístico: ${(err as Error).message}`,
        );
      }
    }
    return this.heuristicTranslate(question, organizationId);
  }

  private async callGemini(
    question: string,
    organizationId: string,
    schemaContext: string,
    apiKey: string,
  ) {
    const model = process.env.GEMINI_MODEL || "gemini-1.5-pro";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const prompt = [
      "Eres el asistente Text-to-SQL de Fleetline Presidencia.",
      "Devuelve JSON estricto: {\"sql\":\"SELECT ...\",\"answer\":\"resumen en español\"}",
      "Solo SELECT. organizationId literal:",
      organizationId,
      schemaContext,
      "Pregunta:",
      question,
    ].join("\n");

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Gemini HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      body.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Gemini sin JSON");
    const parsed = JSON.parse(jsonMatch[0]) as { sql?: string; answer?: string };
    if (!parsed.sql) throw new Error("Gemini sin sql");
    return {
      sql: parsed.sql,
      answerText: parsed.answer || "Consulta generada por Gemini Pro",
      engine: "gemini-pro",
    };
  }

  heuristicTranslate(question: string, organizationId: string) {
    const q = question.toLowerCase();
    const org = organizationId.replace(/'/g, "");

    if (q.includes("soat") || q.includes("bloqueo") || q.includes("kill")) {
      return {
        sql: `SELECT v.plate, v."complianceBlocked", COUNT(cd.id) AS soat_docs FROM "Vehicle" v LEFT JOIN "ComplianceDocument" cd ON cd."vehicleId" = v.id AND cd.type = 'SOAT' WHERE v."organizationId" = '${org}' GROUP BY v.id, v.plate, v."complianceBlocked" ORDER BY v."complianceBlocked" DESC LIMIT 50`,
        answerText:
          "Consulta preparada: unidades y documentación SOAT / Kill-Switch (Módulo 06).",
        engine: "heuristic",
      };
    }

    if (q.includes("ruta") || q.includes("rentab") || q.includes("margen")) {
      return {
        sql: `SELECT t.origin, t.destination, COUNT(*) AS trips, SUM(t."fareAmount") AS revenue FROM "Trip" t WHERE t."organizationId" = '${org}' AND t.status = 'COMPLETED' GROUP BY t.origin, t.destination ORDER BY revenue DESC LIMIT 20`,
        answerText:
          "Consulta preparada: rentabilidad por corredor origen→destino (Módulos 04/10).",
        engine: "heuristic",
      };
    }

    if (q.includes("pago") || q.includes("caja") || q.includes("tesorer")) {
      return {
        sql: `SELECT status, COUNT(*) AS n, SUM(amount) AS total FROM "PaymentSchedule" WHERE "organizationId" = '${org}' GROUP BY status`,
        answerText:
          "Consulta preparada: flujo de obligaciones de pago (Módulo 09).",
        engine: "heuristic",
      };
    }

    if (
      q.includes("compra") ||
      q.includes("discrepan") ||
      q.includes("3-way") ||
      q.includes("3 way")
    ) {
      return {
        sql: `SELECT m.status, COUNT(*) AS n FROM "ThreeWayMatch" m INNER JOIN "PurchaseOrder" po ON po.id = m."purchaseOrderId" WHERE po."organizationId" = '${org}' GROUP BY m.status`,
        answerText:
          "Consulta preparada: estado de 3-Way Matching / discrepancias (Módulo 08).",
        engine: "heuristic",
      };
    }

    return {
      sql: `SELECT status, COUNT(*) AS n, SUM("fareAmount") AS fare FROM "Trip" WHERE "organizationId" = '${org}' GROUP BY status`,
      answerText:
        "Consulta genérica de operaciones de flota (fallback heurístico).",
      engine: "heuristic",
    };
  }
}
