"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { normalizeRole } from "@fsg/shared";
import { useAuth } from "@/lib/auth-context";

/** Hub taller → pantalla según cargo (SCRUM-57). */
export default function TallerPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const role = normalizeRole(String(user?.role || ""));
    if (role === "mecanico") {
      router.replace("/taller/mecanico");
      return;
    }
    if (role === "auxiliar_almacen_taller") {
      router.replace("/taller/almacen/dashboard");
      return;
    }
    router.replace("/taller/coordinador/dashboard");
  }, [user, router]);

  return (
    <p className="p-6 font-data text-sm text-brand-text-secondary">
      Enrutando a su hub de taller…
    </p>
  );
}
