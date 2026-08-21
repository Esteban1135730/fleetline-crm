import { config } from "dotenv";
import { resolve } from "path";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { existsSync, mkdirSync } from "fs";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { sanitizeBodyMiddleware } from "./common/sanitize-body.middleware";
import { ZodExceptionFilter } from "./common/zod-exception.filter";
import { resolveJwtSecret } from "./security/jwt-secret";

config({ path: resolve(__dirname, "../../../.env") });

async function bootstrap() {
  // Pilar 1/9 — fallar temprano si falta JWT
  resolveJwtSecret();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.FLEETLINE_ENV === "production";

  const uploadsDir = resolve(__dirname, "../../../uploads");
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  // Pilar 16 — en prod solo vía /uploads autenticado (SecureUploadsController)
  if (!isProd && process.env.UPLOADS_PUBLIC !== "false") {
    app.useStaticAssets(uploadsDir, { prefix: "/uploads/" });
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              frameAncestors: ["'none'"],
              objectSrc: ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      frameguard: { action: "deny" },
      noSniff: true,
      hsts: isProd
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(cookieParser());

  const origins = (
    process.env.CORS_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001,http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006,http://127.0.0.1:19006"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      if (!isProd && /^exp:\/\//i.test(origin)) return callback(null, true);
      if (!isProd && /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Organization-Id",
      "Accept",
      "X-Turnstile-Token",
    ],
  });

  app.use(sanitizeBodyMiddleware);
  app.useGlobalFilters(new ZodExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  if (isProd && process.env.FORCE_HTTPS === "true") {
    app.use((req, res, next) => {
      const proto = req.headers["x-forwarded-proto"];
      if (proto === "http") {
        const host = req.headers.host || "localhost";
        return res.redirect(301, `https://${host}${req.url}`);
      }
      return next();
    });
  }

  const port = Number(process.env.API_PORT || 4000);
  await app.listen(port);
  console.log(`FSG API listening on http://localhost:${port}`);
}
bootstrap();
