"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Tras login con clave genérica, bloquea el CRM hasta cambiar contraseña.
 */
export function ForcePasswordGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (!user.mustChangePassword) return;
    const allowed =
      pathname === "/cuenta" ||
      pathname === "/login" ||
      pathname.startsWith("/login");
    if (!allowed) {
      router.replace("/cuenta?force=1");
    }
  }, [user, loading, pathname, router]);

  return <>{children}</>;
}
