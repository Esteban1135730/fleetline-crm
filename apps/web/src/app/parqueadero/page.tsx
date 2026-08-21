import { redirect } from "next/navigation";

/** Control de parqueadero → Patio inteligente (LPR / talanquera). */
export default function ParqueaderoPage() {
  redirect("/patio/dashboard");
}
