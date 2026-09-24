"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  Building2,
  Plus,
  ShieldAlert,
  Users,
  UserX,
} from "lucide-react";
import { api } from "@/lib/api";
import { ROLE_LABELS, statusEs, type Role } from "@fsg/shared";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { SlideOver, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";

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
  organization: {
    id: string;
    name: string;
    nit: string;
    status: string;
  } | null;
};

const EMPTY_FORM = {
  organizationName: "",
  nit: "",
  adminName: "",
  adminEmail: "",
  adminPassword: "",
  maxUsers: "50",
};

export default function PlataformaPage() {
  const { user, loading, setActiveOrganization } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [tab, setTab] = useState("tenants");
  const [search, setSearch] = useState("");
  const [slideOpen, setSlideOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

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

  const activeTenants = orgs.filter((o) => o.status === "ACTIVE").length;
  const suspendedTenants = orgs.filter((o) => o.status === "SUSPENDED").length;
  const totalLicenses = orgs.reduce((s, o) => s + o.maxUsers, 0);

  const filteredOrgs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.nit.toLowerCase().includes(q) ||
        o.tenantId.toLowerCase().includes(q),
    );
  }, [orgs, search]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.organization?.name ?? "").toLowerCase().includes(q),
    );
  }, [users, search]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    setBusy(true);
    try {
      const res = await api<{ message: string }>("/plataforma/organizations", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          maxUsers: Number(form.maxUsers) || 50,
        }),
      });
      setOk(res.message);
      setForm(EMPTY_FORM);
      setSlideOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
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
      setOk("Empresa actualizada");
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

  function roleLabel(role: string) {
    return ROLE_LABELS[role as Role] || statusEs(role) || role;
  }

  if (loading || user?.role !== "platform_master") {
    return (
      <div className="p-8 text-sm text-brand-text-secondary">
        Verificando acceso Usuario Maestro…
      </div>
    );
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sans text-lg font-semibold tracking-tight text-brand-text-primary">
            Usuario Maestro · multiempresa
          </h1>
          <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
            Configuración · empresas · licencias
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          onClick={() => setSlideOpen(true)}
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Registrar empresa
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <BentoPanel
          title="Empresas"
          subtitle="Registradas en la plataforma"
          icon={<Building2 aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-text-primary">
            {orgs.length}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Activas"
          subtitle="En operación normal"
          icon={<ShieldAlert aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-success">
            {activeTenants}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Suspendidas"
          subtitle="Acceso bloqueado"
          icon={<UserX aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-danger">
            {suspendedTenants}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Licencias"
          subtitle="Cupos totales de usuarios"
          icon={<Users aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-primary">
            {totalLicenses}
          </p>
        </BentoPanel>
      </div>

      {error ? (
        <p className="text-sm text-brand-danger">{error}</p>
      ) : null}
      {ok ? (
        <p className="text-sm text-brand-success">{ok}</p>
      ) : null}

      <WorkbenchToolbar>
        <WorkbenchTabs
          tabs={[
            { id: "tenants", label: "Empresas", count: orgs.length },
            {
              id: "usuarios",
              label: "Usuarios (todas las empresas)",
              count: users.length,
            },
          ]}
          value={tab}
          onChange={setTab}
        />
        <WorkbenchSearch
          value={search}
          onChange={setSearch}
          placeholder={
            tab === "tenants"
              ? "Buscar empresa, NIT o código…"
              : "Buscar usuario o empresa…"
          }
        />
      </WorkbenchToolbar>

      {tab === "tenants" ? (
        <BentoPanel title="Empresas registradas" subtitle="Gestión multiempresa">
          <NexaTable
            columns={[
              "Empresa",
              "NIT / código",
              "Licencias",
              "Estado",
              "Acciones",
            ]}
          >
            {filteredOrgs.map((o) => (
              <NexaRow key={o.id}>
                <NexaCell className="font-medium">{o.name}</NexaCell>
                <NexaCell mono>
                  <p className="text-xs">{o.nit}</p>
                  <p className="text-[10px] text-brand-text-secondary">
                    {o.tenantId}
                  </p>
                </NexaCell>
                <NexaCell mono className="text-xs">
                  {o.userCount}/{o.maxUsers} · libres {o.licensesRemaining}
                </NexaCell>
                <NexaCell>
                  <StatusPulseBadge
                    tone={o.status === "ACTIVE" ? "active" : "danger"}
                    pulse={o.status !== "ACTIVE"}
                  >
                    {statusEs(o.status)}
                  </StatusPulseBadge>
                </NexaCell>
                <NexaCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      className="w-auto px-3 py-1.5 text-xs"
                      onClick={() => setActiveOrganization(o.id, "/usuarios")}
                    >
                      Operar
                    </Button>
                    {o.status === "SUSPENDED" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="w-auto px-3 py-1.5 text-xs"
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
                        className="w-auto px-3 py-1.5 text-xs"
                        onClick={() =>
                          patchOrg(o.tenantId, {
                            status: "SUSPENDED",
                            suspendedReason:
                              "Suspendido desde consola Usuario Maestro",
                          })
                        }
                      >
                        Suspender
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-auto px-3 py-1.5 text-xs"
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
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      ) : (
        <BentoPanel
          title="Usuarios de todas las empresas"
          subtitle={`${users.length} cuentas · sin filtro de empresa`}
        >
          <NexaTable
            columns={["Usuario", "Rol", "Empresa", "Estado", "Acción"]}
          >
            {filteredUsers.map((u) => (
              <NexaRow key={u.id}>
                <NexaCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="font-data text-[10px] text-brand-text-secondary">
                    {u.email}
                  </p>
                </NexaCell>
                <NexaCell className="text-xs">
                  {roleLabel(u.role)}
                </NexaCell>
                <NexaCell className="text-xs">
                  {u.organization?.name || "—"}
                </NexaCell>
                <NexaCell>
                  <StatusPulseBadge tone={u.active ? "active" : "danger"}>
                    {u.active ? "Activo" : "Inactivo"}
                  </StatusPulseBadge>
                </NexaCell>
                <NexaCell>
                  {u.role !== "platform_master" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-auto px-2 py-1 text-xs"
                      onClick={() => void toggleUser(u)}
                    >
                      {u.active ? "Desactivar" : "Activar"}
                    </Button>
                  ) : (
                    <span className="font-data text-[10px] text-brand-text-secondary">
                      Usuario Maestro
                    </span>
                  )}
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      )}

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Registrar empresa y administrador"
        description="Cada empresa incluye un administrador inicial y un cupo de licencias (usuarios)."
        widthClass="max-w-lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() => setSlideOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="plataforma-alta-form"
              variant="primary"
              className="w-auto"
              disabled={busy}
            >
              Registrar empresa
            </Button>
          </div>
        }
      >
        <form
          id="plataforma-alta-form"
          onSubmit={onCreate}
          className="space-y-4"
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
            placeholder="Licencias (máx. usuarios)"
            type="number"
            min={1}
            value={form.maxUsers}
            onChange={(e) =>
              setForm((f) => ({ ...f, maxUsers: e.target.value }))
            }
            required
          />
          <input
            className="field"
            placeholder="Nombre del administrador"
            data-field="personName"
            value={form.adminName}
            onChange={(e) =>
              setForm((f) => ({ ...f, adminName: e.target.value }))
            }
            required
          />
          <input
            className="field font-data"
            placeholder="Correo del administrador"
            type="email"
            value={form.adminEmail}
            onChange={(e) =>
              setForm((f) => ({ ...f, adminEmail: e.target.value }))
            }
            required
          />
          <input
            className="field"
            placeholder="Clave del administrador (mín. 8)"
            type="password"
            value={form.adminPassword}
            onChange={(e) =>
              setForm((f) => ({ ...f, adminPassword: e.target.value }))
            }
            required
            minLength={8}
          />
        </form>
      </SlideOver>
    </div>
  );
}
