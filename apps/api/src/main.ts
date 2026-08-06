import { config } from "dotenv";
import { resolve } from "path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { existsSync, mkdirSync } from "fs";
import { AppModule } from "./app.module";

config({ path: resolve(__dirname, "../../../.env") });

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const uploadsDir = resolve(__dirname, "../../../uploads");
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: "/uploads/" });

  const origins = (
    process.env.CORS_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    // Expo Go / celular físico envían Origin variable; permitir LAN + lista fija
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      if (/^exp:\/\//i.test(origin)) return callback(null, true);
      if (/^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(null, origins.length === 0);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  if (!process.env.JWT_SECRET) {
    console.warn(
      "[WARN] JWT_SECRET no definido — usando secreto de desarrollo. Defínelo en producción.",
    );
  }

  const port = Number(process.env.API_PORT || 4000);
  await app.listen(port);
  console.log(`FSG API listening on http://localhost:${port}`);
}
bootstrap();
