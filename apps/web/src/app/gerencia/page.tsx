"use client";

import { AreaCockpitShell } from "@/components/area-cockpit-shell";

export default function GerenciaPage() {
  return (
    <AreaCockpitShell
      module="gerencia"
      title="Tablero de Gerencia General"
      statusLine="Estado del sistema: nominal — coordinación entre áreas"
      kpis={[
        {
          label: "Viajes en curso",
          value: "—",
          hint: "Señal de telemetría en vivo",
          accent: "emerald",
        },
        {
          label: "OT abiertas",
          value: "—",
          hint: "Taller",
          accent: "amber",
        },
        {
          label: "CxC / CxP",
          value: "—",
          hint: "Tesorería",
          accent: "primary",
        },
        {
          label: "Bloqueos despacho",
          value: "—",
          hint: "Trámites · SARLAFT",
          accent: "rose",
        },
      ]}
      protocol={[
        "Priorice bloqueos de despacho y alertas QHSE.",
        "Coordine con Logística, Comercial y RRHH según carga.",
        "Abra [ ? ] para la guía operativa de Gerencia General.",
      ]}
    />
  );
}
