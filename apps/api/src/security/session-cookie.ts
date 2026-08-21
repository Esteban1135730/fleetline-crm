import { CookieOptions } from "express";

export const ACCESS_COOKIE = "fl_access";

export function sessionCookieOptions(): CookieOptions {
  const isProd =
    process.env.NODE_ENV === "production" ||
    process.env.FLEETLINE_ENV === "production" ||
    process.env.COOKIE_SECURE === "true";

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export function clearCookieOptions(): CookieOptions {
  return {
    ...sessionCookieOptions(),
    maxAge: 0,
  };
}
