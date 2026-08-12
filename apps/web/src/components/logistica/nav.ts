"use client";

/**
 * Contratos de UI para submenús Logística.
 * Rutas FE: /logistica/servicios | /logistica/conductores | .../reporte-nomina
 * API:     /logistica/* | /nomina/*
 */

export type LogisticaSubmenuId = "servicios" | "conductores" | "reporte-nomina";

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
  {
    id: "reporte-nomina" as const,
    href: "/logistica/conductores/reporte-nomina",
    label: "Reporte Nómina / Tarifario de Recargos",
    apiBase: "/nomina",
  },
] as const;
