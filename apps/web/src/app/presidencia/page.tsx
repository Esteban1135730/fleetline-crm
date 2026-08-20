import { redirect } from "next/navigation";

/** Índice de Presidencia → tablero ejecutivo con KPIs y gráficos reales. */
export default function PresidenciaPage() {
  redirect("/presidencia/dashboard");
}
