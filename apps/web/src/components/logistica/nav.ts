"use client";

/**
 * Contratos de UI para submenús Logística.
 * Rutas FE: /logistica/servicios | /logistica/conductores
 * API:     /logistica/servicios/* | /logistica/conductores/*
 */

export type LogisticaSubmenuId = "servicios" | "conductores";

export const LOGISTICA_SUBMENUS = [
  {
    id: "servicios" as const,
    href: "/logistica/servicios",
    label: "Programación de Servicios y Tracking GPS",
    apiBase: "/logistica/servicios",
  },
  {
    id: "conductores" as const,
    href: "/logistica/conductores",
    label: "Gestión de Conductores y Nómina de Extras",
    apiBase: "/logistica/conductores",
  },
] as const;
