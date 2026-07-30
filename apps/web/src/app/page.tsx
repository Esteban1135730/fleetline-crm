"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, loading, homePath } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? homePath : "/login");
  }, [user, loading, homePath, router]);

  return (
    <div className="flex h-screen items-center justify-center text-[var(--brand-muted)]">
      Redirigiendo…
    </div>
  );
}
