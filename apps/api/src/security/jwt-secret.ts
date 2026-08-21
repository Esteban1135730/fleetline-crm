/**
 * Resuelve JWT_SECRET. En producción falla el boot si falta o es el secreto de demo.
 */
const FORBIDDEN_SECRETS = new Set([
  "dev-secret-fsg-mega-os-2026",
  "cambia_esta_clave",
  "cambia_este_secreto_local_min_32_chars_xx",
  "genera_un_secreto_largo_aleatorio_minimo_32",
  "changeme",
  "secret",
]);

export function resolveJwtSecret(): string {
  const secret = (process.env.JWT_SECRET || "").trim();
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.FLEETLINE_ENV === "production";

  if (!secret) {
    if (isProd) {
      throw new Error(
        "JWT_SECRET es obligatorio en producción. Defínelo en .env.production.",
      );
    }
    throw new Error(
      "JWT_SECRET no definido. Cópialo desde .env.example a .env (nunca uses el valor de ejemplo en prod).",
    );
  }

  if (isProd && (FORBIDDEN_SECRETS.has(secret) || secret.length < 32)) {
    throw new Error(
      "JWT_SECRET de producción inválido (demasiado corto o es un secreto de demo).",
    );
  }

  return secret;
}
