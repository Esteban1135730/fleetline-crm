import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.user.updateMany({
    data: { mustChangePassword: false, status: "ACTIVE" },
  });
  console.log(`[fix-login] mustChangePassword=false en ${result.count} usuarios`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
