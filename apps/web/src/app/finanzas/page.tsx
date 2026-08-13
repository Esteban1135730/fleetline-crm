import { redirect } from "next/navigation";

/** Alias legado → CFO Hub (Director Financiero) o Tesorería operativa */
export default function FinanzasRedirect() {
  redirect("/finanzas/cfo/dashboard");
}
