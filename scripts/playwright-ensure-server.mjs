/**
 * Arranca un comando solo si la URL aún no responde.
 * Evita EADDRINUSE cuando ya hay Next/Nest en :3000/:4000.
 *
 * Uso: node scripts/playwright-ensure-server.mjs <url> <comando...>
 */
import http from "node:http";
import { spawn } from "node:child_process";

const url = process.argv[2];
const command = process.argv.slice(3).join(" ");

if (!url || !command) {
  console.error(
    "Uso: node scripts/playwright-ensure-server.mjs <url> <comando...>",
  );
  process.exit(1);
}

function probe(target, ms = 2500) {
  return new Promise((resolve) => {
    const req = http.get(target, (res) => {
      res.resume();
      // Cualquier respuesta HTTP = proceso vivo (incluye 500 de Next en hot-reload)
      resolve({ ok: true, status: res.statusCode ?? 0 });
    });
    req.on("error", () => resolve({ ok: false, status: 0 }));
    req.setTimeout(ms, () => {
      req.destroy();
      resolve({ ok: false, status: 0 });
    });
  });
}

const existing = await probe(url);
if (existing.ok) {
  if (existing.status >= 500) {
    console.warn(
      `[ensure-server] ${url} responde HTTP ${existing.status} — reutilizando igual (no se relanza para evitar EADDRINUSE)`,
    );
  } else {
    console.log(
      `[ensure-server] Ya responde ${url} (HTTP ${existing.status}) — reutilizando`,
    );
  }
  setInterval(() => {}, 1 << 30);
} else {
  console.log(`[ensure-server] Levantando: ${command}`);
  const child = spawn(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  const shutdown = () => {
    if (!child.killed) child.kill("SIGTERM");
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", shutdown);

  child.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 1);
  });
}
