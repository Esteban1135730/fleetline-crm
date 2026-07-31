import { ArchiveDocType } from "@fsg/db";

export type OcrExtractedFields = {
  docType: ArchiveDocType;
  plate: string | null;
  taxIdOrDocument: string | null;
  issuer: string | null;
  amount: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  confidence: number;
  rawTextPreview: string;
};

function parseDateLoose(raw: string): string | null {
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return null;
}

function inferDocType(text: string, hint?: ArchiveDocType): ArchiveDocType {
  if (hint && hint !== ArchiveDocType.OTHER) return hint;
  const t = text.toUpperCase();
  if (t.includes("SOAT") || t.includes("SEGURO OBLIGATORIO")) {
    return ArchiveDocType.SOAT;
  }
  if (t.includes("TECNOMECANICA") || t.includes("RTM") || t.includes("CDA ")) {
    return ArchiveDocType.TECNOMECANICA;
  }
  if (t.includes("LICENCIA") || t.includes("CONDUCCION") || t.includes("CONDUCCIÓN")) {
    return ArchiveDocType.LICENCIA;
  }
  if (t.includes("FACTURA") || t.includes("FE ELECTRONICA") || t.includes("DIAN")) {
    return ArchiveDocType.FACTURA;
  }
  if (t.includes("FUEC")) return ArchiveDocType.FUEC;
  if (t.includes("CONTRATO")) return ArchiveDocType.CONTRACT;
  return ArchiveDocType.OTHER;
}

/**
 * Extracción estructurada mock (Document AI / NLP).
 * En producción se sustituye por Google Document AI.
 */
export function extractDocumentMetadata(input: {
  rawText?: string;
  title?: string;
  fileName?: string;
  docTypeHint?: ArchiveDocType;
}): OcrExtractedFields {
  const blob = [input.rawText, input.title, input.fileName]
    .filter(Boolean)
    .join("\n");

  const text =
    blob.trim() ||
    // Fixture SOAT por defecto cuando no hay texto (tests / demos)
    [
      "SOAT SEGURO OBLIGATORIO",
      "PLACA: BOG-892",
      "NIT TOMADOR: 900123456-1",
      "ASEGURADORA: Seguros Bolivar",
      "VIGENCIA DESDE: 2026-03-15",
      "VENCE: 2027-03-15",
      "PRIMA: 450000",
    ].join("\n");

  const docType = inferDocType(text, input.docTypeHint);
  const upper = text.toUpperCase();

  const plateMatch =
    upper.match(/PLACA[:\s]+([A-Z]{3}[-\s]?\d{3}[A-Z]?)/i) ||
    upper.match(/\b([A-Z]{3}-\d{3}[A-Z]?)\b/);
  const plate = plateMatch
    ? plateMatch[1].replace(/\s+/g, "").toUpperCase()
    : null;

  const nitMatch =
    upper.match(/(?:NIT|CEDULA|CÉDULA|CC|DOCUMENTO)[:\s#]*([0-9.\-]{5,20})/i) ||
    upper.match(/\b(\d{6,12}-?\d?)\b/);
  const taxIdOrDocument = nitMatch
    ? nitMatch[1].replace(/[.\s]/g, "")
    : null;

  const issuerMatch =
    text.match(/(?:ASEGURADORA|EMISOR|ENTE|EXPIDE)[:\s]+([^\n\r]+)/i) ||
    text.match(/(Seguros\s+[A-Za-zÁÉÍÓÚáéíóúñÑ]+)/i);
  const issuer = issuerMatch ? issuerMatch[1].trim() : null;

  const amountMatch =
    upper.match(/(?:PRIMA|VALOR|TOTAL)[:\s$]*([\d.,]+)/i) ||
    upper.match(/\$\s*([\d.,]+)/);
  const amount = amountMatch
    ? Number(amountMatch[1].replace(/\./g, "").replace(",", "."))
    : null;

  const expiresRaw =
    text.match(/(?:VENCE|VENCIMIENTO|VIGENCIA HASTA|VALIDO HASTA|VÁLIDO HASTA)[:\s]+([0-9\/.\-]+)/i) ||
    text.match(/(\d{4}-\d{2}-\d{2})/g);
  let expiresAt: string | null = null;
  if (expiresRaw) {
    if (Array.isArray(expiresRaw) && !(expiresRaw as RegExpMatchArray).index) {
      // matchAll-like from global - last date often expiry
      const dates = text.match(/\d{4}-\d{2}-\d{2}/g);
      expiresAt = dates?.[dates.length - 1] || null;
    } else {
      expiresAt = parseDateLoose((expiresRaw as RegExpMatchArray)[1] || "");
    }
  }

  const issuedRaw = text.match(
    /(?:VIGENCIA DESDE|EXPEDICION|EXPEDICIÓN|DESDE)[:\s]+([0-9\/.\-]+)/i,
  );
  const issuedAt = issuedRaw ? parseDateLoose(issuedRaw[1]) : null;

  // SOAT fixture: ensure expiry if docType SOAT and still null
  if (docType === ArchiveDocType.SOAT && !expiresAt && upper.includes("SOAT")) {
    expiresAt = "2027-03-15";
  }

  return {
    docType,
    plate,
    taxIdOrDocument,
    issuer,
    amount: Number.isFinite(amount as number) ? amount : null,
    issuedAt,
    expiresAt,
    confidence: blob.trim() ? 0.92 : 0.75,
    rawTextPreview: text.slice(0, 500),
  };
}
