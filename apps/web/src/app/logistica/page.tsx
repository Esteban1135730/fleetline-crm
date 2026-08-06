import { redirect } from "next/navigation";

/** Raíz de Logística → submenú Programación de Servicios */
export default function LogisticaIndexPage() {
  redirect("/logistica/servicios");
}
