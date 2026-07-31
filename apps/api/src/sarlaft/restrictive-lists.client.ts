/**
 * Cliente mock de listas restrictivas (OFAC, ONU, PEPs, Nacionales).
 * En producción se sustituye por uplink a proveedores AML reales.
 */

export type RestrictiveListHit = {
  list: "OFAC" | "ONU" | "PEPS" | "NACIONAL";
  matchType: "EXACT" | "FUZZY";
  reference: string;
  description: string;
};

export type RestrictiveScreenResult = {
  document: string;
  hits: RestrictiveListHit[];
  /** 0–100 */
  riskScore: number;
  matched: boolean;
};

const BLOCKED_DOCS = new Set([
  // NITs / cédulas de prueba en lista restrictiva
  "900999888",
  "800111222",
  "1234567890",
  "OFAC001",
  "PEP999",
]);

const PEP_DOCS = new Set(["PEPNIT01", "111222333"]);

export function normalizeSarlaftDoc(raw: string): string {
  return String(raw || "")
    .replace(/[\s.\-]/g, "")
    .toUpperCase();
}

export class RestrictiveListsClient {
  async screen(
    taxIdOrDocument: string,
    subjectName?: string,
  ): Promise<RestrictiveScreenResult> {
    const document = normalizeSarlaftDoc(taxIdOrDocument);
    const hits: RestrictiveListHit[] = [];

    if (BLOCKED_DOCS.has(document)) {
      hits.push({
        list: "OFAC",
        matchType: "EXACT",
        reference: `OFAC-${document}`,
        description: "Coincidencia exacta en lista OFAC (mock)",
      });
      hits.push({
        list: "NACIONAL",
        matchType: "EXACT",
        reference: `LAFT-${document}`,
        description: "Lista nacional restrictiva (mock)",
      });
    }

    if (PEP_DOCS.has(document)) {
      hits.push({
        list: "PEPS",
        matchType: "EXACT",
        reference: `PEP-${document}`,
        description: "Persona Expuesta Políticamente (mock)",
      });
    }

    const name = (subjectName || "").toLowerCase();
    if (name.includes("lavado") || name.includes("ofac blocked")) {
      hits.push({
        list: "ONU",
        matchType: "FUZZY",
        reference: "ONU-NAME-HIT",
        description: `Coincidencia fuzzy por nombre: ${subjectName}`,
      });
    }

    let riskScore = 0;
    if (hits.some((h) => h.list === "OFAC" || h.list === "ONU")) {
      riskScore = Math.max(riskScore, 95);
    }
    if (hits.some((h) => h.list === "NACIONAL")) {
      riskScore = Math.max(riskScore, 90);
    }
    if (hits.some((h) => h.list === "PEPS")) {
      riskScore = Math.max(riskScore, 75);
    }
    if (hits.some((h) => h.matchType === "FUZZY") && riskScore < 80) {
      riskScore = Math.max(riskScore, 82);
    }

    return {
      document,
      hits,
      riskScore,
      matched: hits.length > 0,
    };
  }
}
