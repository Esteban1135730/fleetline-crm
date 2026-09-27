"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { tallerHubPath } from "@/lib/route-access";

/** Hub taller → pantalla según cargo (SCRUM-57). */
export default function TallerPage() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(tallerHubPath(String(user?.role || "")));
  }, [user, router]);

  return (
    <p className="p-6 font-data text-sm text-brand-text-secondary">
      Enrutando a su hub de taller…
    </p>
  );
}
