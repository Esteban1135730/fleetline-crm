import { SetMetadata } from "@nestjs/common";

/** Marca rutas públicas (login, health). El JwtAuthGuard global las omite. */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
