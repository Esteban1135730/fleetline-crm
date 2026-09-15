/**
 * SOLO desarrollo local. No ejecutar en producción.
 * Uso: CONFIRM_FIX_LOGIN=1 pnpm --filter @fsg/db exec tsx scripts/fix-login-flags.ts
 * Opcional: EMAIL=user@x.com para un solo usuario.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (process.env.CONFIRM_FIX_LOGIN !== "1") {
    console.error(
      "Abortado: define CONFIRM_FIX_LOGIN=1. Opcional EMAIL=... para un solo usuario.",
    );
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production") {
    console.error("Abortado: no usar fix-login-flags en production.");
    process.exit(1);
  }

  const email = process.env.EMAIL?.trim().toLowerCase();
  if (email) {
    const result = await prisma.user.updateMany({
      where: { email },
      data: { mustChangePassword: false, status: "ACTIVE" },
    });
    console.log(
      `[fix-login] mustChangePassword=false en ${result.count} usuario(s) (${email})`,
    );
    return;
  }

  const result = await prisma.user.updateMany({
    data: { mustChangePassword: false, status: "ACTIVE" },
  });
  console.log(
    `[fix-login] mustChangePassword=false en ${result.count} usuarios (todos)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
