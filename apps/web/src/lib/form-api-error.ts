/** Errores de API para formularios: mensaje general + por campo. */

export type FormApiViolation = { path?: string; message?: string };

export type FormApiErrorSplit = {
  formError: string;
  fieldErrors: Record<string, string>;
};

type ErrLike = Error & {
  violations?: FormApiViolation[];
};

const FIELD_HINTS: Array<{ keys: string[]; test: RegExp }> = [
  { keys: ["email"], test: /correo|e-?mail/i },
  { keys: ["document"], test: /documento|c[eé]dula|\bnit\b/i },
  { keys: ["name", "requester", "hostName"], test: /nombre/i },
  { keys: ["companyName", "company"], test: /empresa|raz[oó]n social/i },
  { keys: ["phone"], test: /tel[eé]fono|celular/i },
  { keys: ["title", "position"], test: /\btitle\b|\bposition\b|cargo/i },
  { keys: ["area"], test: /\barea\b|área/i },
  { keys: ["message"], test: /mensaje|texto/i },
  { keys: ["badgeRfid"], test: /rfid|gafete/i },
];

function rootPath(path: string) {
  return path.split(".")[0]?.trim() || "";
}

/**
 * Separa un error de API en mensaje de formulario y errores de campo.
 * `fieldKeys` limita qué paths se consideran campos del formulario actual.
 */
export function splitFormApiError(
  err: unknown,
  fieldKeys: string[],
): FormApiErrorSplit {
  const allowed = new Set(fieldKeys);
  const fieldErrors: Record<string, string> = {};
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "No se pudo completar el registro";

  const violations = (err as ErrLike)?.violations;
  if (Array.isArray(violations)) {
    for (const v of violations) {
      const key = rootPath(String(v.path || ""));
      const msg = (v.message || "").trim();
      if (!key || !msg || !allowed.has(key) || fieldErrors[key]) continue;
      fieldErrors[key] = msg;
    }
  }

  if (!Object.keys(fieldErrors).length) {
    for (const hint of FIELD_HINTS) {
      if (!hint.test.test(message)) continue;
      const key = hint.keys.find((k) => allowed.has(k));
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = message;
        break;
      }
    }
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  // Si el error ya quedó asociado a un campo, no duplicar banner general.
  if (hasFieldErrors) {
    const unmappedViolation =
      Array.isArray(violations) &&
      violations.some((v) => {
        const key = rootPath(String(v.path || ""));
        return key.length > 0 && !allowed.has(key);
      });
    return {
      formError: unmappedViolation ? message : "",
      fieldErrors,
    };
  }

  return { formError: message, fieldErrors };
}

export function clearFieldError(
  prev: Record<string, string>,
  key: string,
): Record<string, string> {
  if (!prev[key]) return prev;
  const next = { ...prev };
  delete next[key];
  return next;
}
