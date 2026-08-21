import { redirect } from "next/navigation";

/** Hub taller → torre del coordinador (kanban / bahías / predictivo). */
export default function TallerPage() {
  redirect("/taller/coordinador/dashboard");
}
