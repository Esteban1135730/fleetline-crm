"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { HowToBox, PageIntro } from "@/components/page-intro";
import { useRouter } from "next/navigation";

type OrgRow = {
  id: string;
  tenantId: string;
  name: string;
  nit: string;
  status: string;
  maxUsers: number;
  userCount: number;
  licensesRemaining: number;
  admins: Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
  }>;
  createdAt: string;
};

type MasterUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  active: boolean;
  tenantId: string;
  organization: { id: string; name: string; nit: string; status: string } | null;
};

export default function PlataformaPage() {
  const { user, loading, setActiveOrganization } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [form, setForm] = useState({
    organizationName: "",
    nit: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    maxUsers: "50",
  });

  async function load() {
    const [o, u] = await Promise.all([
      api<OrgRow[]>("/plataforma/organizations"),
      api<MasterUser[]>("/plataforma/users"),
    ]);
    setOrgs(o);
    setUsers(u);
  }

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "platform_master") {
      router.replace("/usuarios");
      return;
    }
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Sin permiso"),
    );
  }, [user, loading, router]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    try {
      const res = await api<{ message: string }>("/plataforma/organizations", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          maxUsers: Number(form.maxUsers) || 50,
        }),
      });
      setOk(res.message);
      setForm({
        organizationName: "",
        nit: "",
        adminName: "",
        adminEmail: "",
        adminPassword: "",
        maxUsers: "50",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function patchOrg(
    tenantId: string,
    body: { status?: string; maxUsers?: number; suspendedReason?: string },
  ) {
    setError("");
    setOk("");
    try {
      await api(`/plataforma/organizations/${tenantId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setOk("Tenant actualizado");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  async function toggleUser(u: MasterUser) {
    setError("");
    try {
      await api(`/plataforma/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !u.active }),
      });
      setOk(`${u.email} → ${!u.active ? "activo" : "suspendido"}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  if (loading || user?.role !== "platform_master") {
    return (
      <div className="p-8 text-sm text-[var(--brand-mute)]">
        Verificando acceso Usuario Maestro…
      </div>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <PageIntro
          module="plataforma"
          title="Usuario Maestro · multi-tenant"
        />
        <HowToBox
          steps={[
            "Cada empresa es un tenant. El maestro opera una a la vez desde el selector del encabezado.",
            "El admin de cada empresa tiene mando total sobre su tenant (usuarios, RRHH, operación).",
            "Suspende tenants o usuarios sin afectar otras flotas.",
          ]}
        />
      </div>

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-3"
      >
        <input
          className="field"
          placeholder="Razón social"
          data-field="legalName"
          value={form.organizationName}
          onChange={(e) =>
            setForm((f) => ({ ...f, organizationName: e.target.value }))
          }
          required
        />
        <input
          className="field font-data"
          placeholder="NIT"
          data-field="nit"
          value={form.nit}
          onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))}
          required
        />
        <input
          className="field font-data"
          placeholder="Licencias (maxUsers)"
          type="number"
          min={1}
          value={form.maxUsers}
          onChange={(e) => setForm((f) => ({ ...f, maxUsers: e.target.value }))}
          required
        />
        <input
          className="field"
          placeholder="Nombre Org Admin"
          data-field="personName"
          value={form.adminName}
          onChange={(e) => setForm((f) => ({ ...f, adminName: e.target.value }))}
          required
        />
        <input
          className="field font-data"
          placeholder="Email Org Admin"
          type="email"
          value={form.adminEmail}
          onChange={(e) =>
            setForm((f) => ({ ...f, adminEmail: e.target.value }))
          }
          required
        />
        <input
          className="field"
          placeholder="Clave Org Admin (mín. 8)"
          type="password"
          value={form.adminPassword}
          onChange={(e) =>
            setForm((f) => ({ ...f, adminPassword: e.target.value }))
          }
          required
          minLength={8}
        />
        <Button type="submit" variant="primary">
          Registrar empresa + admin
        </Button>
      </form>

      {error ? <p className="text-sm text-[var(--brand-signal)]">{error}</p> : null}
      {ok ? <p className="text-sm text-[var(--brand-emerald)]">{ok}</p> : null}

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Tenants registrados ({orgs.length})
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">NIT / tenantId</th>
              <th className="px-4 py-2">Licencias</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5 font-medium">{o.name}</td>
                <td className="px-4 py-2.5">
                  <p className="font-data text-xs">{o.nit}</p>
                  <p className="font-data text-[10px] text-[var(--brand-mute)]">
                    {o.tenantId}
                  </p>
                </td>
                <td className="px-4 py-2.5 font-data text-xs">
                  {o.userCount}/{o.maxUsers} · libre {o.licensesRemaining}
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    tone={o.status === "ACTIVE" ? "emerald" : "rose"}
                  >
                    {o.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      className="w-auto"
                      onClick={() => setActiveOrganization(o.id, "/usuarios")}
                    >
                      Operar
                    </Button>
                    {o.status === "SUSPENDED" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          patchOrg(o.tenantId, { status: "ACTIVE" })
                        }
                      >
                        Reactivar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          patchOrg(o.tenantId, {
                            status: "SUSPENDED",
                            suspendedReason: "Suspendido desde consola maestro",
                          })
                        }
                      >
                        Suspender
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        const n = window.prompt(
                          "Nuevo tope de licencias",
                          String(o.maxUsers),
                        );
                        if (!n) return;
                        void patchOrg(o.tenantId, { maxUsers: Number(n) });
                      }}
                    >
                      Licencias
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Usuarios cross-tenant ({users.length})
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Usuario</th>
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {users.slice(0, 80).map((u) => (
              <tr key={u.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{u.name}</p>
                  <p className="font-data text-[10px] text-[var(--brand-mute)]">
                    {u.email}
                  </p>
                </td>
                <td className="px-4 py-2.5 font-data text-xs">{u.role}</td>
                <td className="px-4 py-2.5 text-xs">
                  {u.organization?.name || "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={u.active ? "emerald" : "rose"}>
                    {u.active ? "ACTIVE" : "OFF"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  {u.role !== "platform_master" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => void toggleUser(u)}
                    >
                      {u.active ? "Desactivar" : "Activar"}
                    </Button>
                  ) : (
                    <span className="text-[10px] text-[var(--brand-mute)]">
                      Maestro
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
