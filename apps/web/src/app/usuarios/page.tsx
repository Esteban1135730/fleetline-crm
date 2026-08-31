"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@fsg/ui";
import {
  CORPORATE_AREA_MODULES,
  MODULE_LABELS,
  ORG_ASSIGNABLE_ROLE_GROUPS,
  ORG_ASSIGNABLE_ROLES,
  ROLE_LABELS,
  ROLE_VIEWS,
  type ModuleId,
  type Role,
} from "@fsg/shared";
import { KeyRound, Plus, Shield, UserCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { SlideOver, StatusPulseBadge } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";
import {
  WorkbenchSearch,
  WorkbenchTabs,
  WorkbenchToolbar,
} from "@/components/workbench-toolbar";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  status?: string;
  organization?: { id: string; name: string; nit: string };
  pendingAuthorization?: boolean;
  message?: string;
};

const MATRIX_MODULES: ModuleId[] = CORPORATE_AREA_MODULES;

function RoleOptions({ assignable }: { assignable: readonly Role[] }) {
  const allowed = new Set(assignable);
  return (
    <>
      {ORG_ASSIGNABLE_ROLE_GROUPS.map((group) => {
        const roles = group.roles.filter((r) => allowed.has(r));
        if (!roles.length) return null;
        return (
          <optgroup key={group.label} label={group.label}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] ?? r}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

function userStatusBadge(u: UserRow) {
  if (u.status === "pending") {
    return (
      <StatusPulseBadge tone="fatiga" pulse>
        Pendiente
      </StatusPulseBadge>
    );
  }
  if (u.active) {
    return <StatusPulseBadge tone="active">Activo</StatusPulseBadge>;
  }
  return <StatusPulseBadge tone="danger">Inactivo</StatusPulseBadge>;
}

export default function UsuariosPage() {
  const { user: me } = useAuth();
  const isMaster = me?.role === "platform_master";
  const assignable = isMaster
    ? ORG_ASSIGNABLE_ROLES
    : ORG_ASSIGNABLE_ROLES.filter(
        (r) => r !== "org_admin" || me?.role === "org_admin",
      );

  const [users, setUsers] = useState<UserRow[]>([]);
  const [tab, setTab] = useState("directorio");
  const [search, setSearch] = useState("");
  const [slideOpen, setSlideOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("gestor_operativo");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setUsers(await api<UserRow[]>("/users"));
  }

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Sin permiso"),
    );
  }, []);

  const pending = users.filter((u) => u.status === "pending");
  const activeCount = users.filter(
    (u) => u.active && u.status !== "pending",
  ).length;

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (ROLE_LABELS[u.role] ?? u.role).toLowerCase().includes(q),
    );
  }, [users, search]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const created = await api<UserRow>("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("gestor_operativo");
      setSlideOpen(false);
      if (created.pendingAuthorization || created.status === "pending") {
        setInfo(
          created.message ||
            "Alta registrada en pendiente — mando superior debe autorizar",
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sans text-lg font-semibold tracking-tight text-brand-text-primary">
            Directorio de accesos
          </h1>
          <p className="mt-0.5 font-data text-[10px] uppercase tracking-[0.12em] text-brand-text-secondary">
            RBAC · cuentas · matriz de permisos
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="w-auto px-4 py-2"
          data-testid="usuarios-open-alta"
          onClick={() => setSlideOpen(true)}
        >
          <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
          Dar de alta
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <BentoPanel title="Total" subtitle="Cuentas" icon={<Users aria-hidden />}>
          <p className="font-data text-3xl font-bold tabular-nums text-brand-text-primary">
            {users.length}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Activos"
          subtitle="Uplink nominal"
          icon={<UserCheck aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-success">
            {activeCount}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Pendientes"
          subtitle="Autorización"
          icon={<Shield aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-warning">
            {pending.length}
          </p>
        </BentoPanel>
        <BentoPanel
          title="Roles"
          subtitle="Asignables"
          icon={<KeyRound aria-hidden />}
        >
          <p className="font-data text-3xl font-bold tabular-nums text-brand-primary">
            {assignable.length}
          </p>
        </BentoPanel>
      </div>

      {pending.length > 0 ? (
        <BentoPanel
          title="Altas pendientes de autorización"
          subtitle={`${pending.length} en cola`}
          icon={<Shield aria-hidden />}
        >
          <ul className="space-y-2">
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-border pb-2 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium text-brand-text-primary">
                    {u.name}
                  </div>
                  <div className="font-data text-xs text-brand-text-secondary">
                    {u.email} · {ROLE_LABELS[u.role] ?? u.role}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    className="w-auto px-3 py-1.5 text-xs"
                    onClick={async () => {
                      await api(`/users/${u.id}/authorize`, {
                        method: "POST",
                        body: JSON.stringify({ decision: "APPROVE" }),
                      });
                      await load();
                    }}
                  >
                    Autorizar
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-auto px-3 py-1.5 text-xs"
                    onClick={async () => {
                      await api(`/users/${u.id}/authorize`, {
                        method: "POST",
                        body: JSON.stringify({ decision: "REJECT" }),
                      });
                      await load();
                    }}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </BentoPanel>
      ) : null}

      {error ? (
        <p className="text-sm text-brand-danger">{error}</p>
      ) : null}
      {info ? (
        <p className="text-sm text-brand-warning">{info}</p>
      ) : null}

      <WorkbenchToolbar>
        <WorkbenchTabs
          tabs={[
            { id: "directorio", label: "Directorio", count: users.length },
            { id: "matriz", label: "Matriz RBAC" },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === "directorio" ? (
          <WorkbenchSearch
            value={search}
            onChange={setSearch}
            placeholder="Buscar por nombre, correo o rol…"
          />
        ) : null}
      </WorkbenchToolbar>

      {tab === "directorio" ? (
        <BentoPanel
          title="Directorio de usuarios"
          subtitle={
            isMaster ? "Empresa activa · cross-tenant" : "Tenant actual"
          }
        >
          <NexaTable
            columns={[
              "Nombre",
              "Correo",
              ...(isMaster ? ["Empresa"] : []),
              "Rol",
              "Estado",
              "Acciones",
            ]}
          >
            {filteredUsers.map((u) => (
              <NexaRow key={u.id}>
                <NexaCell>
                  <input
                    className="field w-full py-1 text-xs"
                    defaultValue={u.name}
                    onBlur={async (e) => {
                      if (e.target.value === u.name) return;
                      await api(`/users/${u.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ name: e.target.value }),
                      });
                      await load();
                    }}
                  />
                </NexaCell>
                <NexaCell mono>
                  <input
                    className="field w-full py-1 font-data text-xs"
                    type="email"
                    defaultValue={u.email}
                    onBlur={async (e) => {
                      if (e.target.value === u.email) return;
                      await api(`/users/${u.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ email: e.target.value }),
                      });
                      await load();
                    }}
                  />
                </NexaCell>
                {isMaster ? (
                  <NexaCell mono className="text-brand-text-secondary">
                    {u.organization?.name ?? "—"}
                  </NexaCell>
                ) : null}
                <NexaCell>
                  <select
                    className="field w-full py-1 text-xs"
                    value={u.role}
                    onChange={async (e) => {
                      await api(`/users/${u.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ role: e.target.value }),
                      });
                      await load();
                    }}
                  >
                    <RoleOptions assignable={assignable} />
                  </select>
                </NexaCell>
                <NexaCell>{userStatusBadge(u)}</NexaCell>
                <NexaCell>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      className="w-auto px-2 py-1 text-xs"
                      onClick={async () => {
                        const pwd = prompt(
                          "Nueva clave para el usuario:",
                          "Fleet2026*",
                        );
                        if (!pwd) return;
                        await api(`/users/${u.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ password: pwd }),
                        });
                      }}
                    >
                      Reset clave
                    </Button>
                    {u.active ? (
                      <Button
                        variant="ghost"
                        className="w-auto px-2 py-1 text-xs"
                        onClick={async () => {
                          await api(`/users/${u.id}/deactivate`, {
                            method: "POST",
                          });
                          await load();
                        }}
                      >
                        Desactivar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        className="w-auto px-2 py-1 text-xs"
                        onClick={async () => {
                          await api(`/users/${u.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              active: true,
                              status: "ACTIVE",
                            }),
                          });
                          await load();
                        }}
                      >
                        Reactivar
                      </Button>
                    )}
                  </div>
                </NexaCell>
              </NexaRow>
            ))}
          </NexaTable>
        </BentoPanel>
      ) : (
        <BentoPanel
          title="Matriz RBAC"
          subtitle="Roles × áreas corporativas"
          icon={<Shield aria-hidden />}
        >
          <div className="overflow-x-auto">
            <NexaTable
              columns={[
                "Rol",
                ...MATRIX_MODULES.map(
                  (m) => MODULE_LABELS[m]?.slice(0, 8) ?? m,
                ),
              ]}
            >
              {assignable.map((r) => {
                const views = new Set(ROLE_VIEWS[r] ?? []);
                return (
                  <NexaRow key={r}>
                    <NexaCell className="min-w-[180px] text-xs font-medium">
                      {ROLE_LABELS[r] ?? r}
                    </NexaCell>
                    {MATRIX_MODULES.map((m) => (
                      <NexaCell key={m} className="text-center">
                        {views.has(m) ? (
                          <span
                            className="font-data text-xs text-brand-success"
                            aria-label="Acceso permitido"
                          >
                            ✓
                          </span>
                        ) : (
                          <span className="font-data text-xs text-brand-text-secondary">
                            —
                          </span>
                        )}
                      </NexaCell>
                    ))}
                  </NexaRow>
                );
              })}
            </NexaTable>
          </div>
        </BentoPanel>
      )}

      <SlideOver
        open={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Alta de usuario"
        description="Email, clave y rol operativo. Roles de mando igual o superior quedan en pendiente."
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
              form="usuarios-alta-form"
              variant="primary"
              className="w-auto"
              disabled={busy}
              data-testid="usuarios-submit"
            >
              Registrar acceso
            </Button>
          </div>
        }
      >
        <form
          id="usuarios-alta-form"
          onSubmit={onCreate}
          className="space-y-4"
        >
          <input
            className="field"
            placeholder="Nombre"
            data-testid="usuarios-name"
            data-field="personName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            autoComplete="name"
          />
          <input
            className="field font-data"
            placeholder="Correo"
            type="email"
            data-testid="usuarios-email"
            data-field="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            className="field"
            placeholder="Clave (mín. 8)"
            type="password"
            data-testid="usuarios-password"
            data-field="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <select
            className="field"
            data-testid="usuarios-role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <RoleOptions assignable={assignable} />
          </select>
        </form>
      </SlideOver>
    </div>
  );
}
