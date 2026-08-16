"use client";

import { AreaCockpitShell } from "@/components/area-cockpit-shell";

export default function PresidenciaPage() {
  return (
    <AreaCockpitShell
      module="presidencia"
      title="Tablero de Presidencia"
      statusLine="Estado del sistema: nominal — gobierno corporativo"
      kpis={[
        {
          label: "Directivas activas",
          value: "—",
          hint: "Instrumentación fase 2",
          accent: "emerald",
        },
        {
          label: "Alertas de flota",
          value: "—",
          hint: "Señal agregada desde Logística / Trámites",
          accent: "amber",
        },
        {
          label: "Margen operativo",
          value: "—",
          hint: "Vinculado a Tesorería",
          accent: "primary",
        },
        {
          label: "Cumplimiento",
          value: "—",
          hint: "SARLAFT · QHSE · Revisoría",
          accent: "rose",
        },
      ]}
      protocol={[
        "Revise el tablero ejecutivo al inicio de jornada.",
        "Escale alertas críticas a Gerencia General o al área dueña.",
        "Use [ ? ] para el protocolo de tres pasos de Presidencia.",
      ]}
    />
  );
}
