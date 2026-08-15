"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { ORG_ASSIGNABLE_ROLE_GROUPS, ORG_ASSIGNABLE_ROLES, ROLE_LABELS, type Role } from "@fsg/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { HowToBox, PageIntro } from "@/components/page-intro";

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

function RoleOptions({
  assignable,
}: {
  assignable: readonly Role[];
}) {
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

export default function UsuariosPage() {
  const { user: me } = useAuth();
  const isMaster = me?.role === "platform_master";
  const assignable = isMaster
    ? ORG_ASSIGNABLE_ROLES
    : ORG_ASSIGNABLE_ROLES.filter((r) => r !== "org_admin" || me?.role === "org_admin");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("gestor_operativo");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function load() {
    setUsers(await api<UserRow[]>("/users"));
  }

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : "Sin permiso"),
    );
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    try {
      const created = await api<UserRow>("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      if (created.pendingAuthorization || created.status === "pending") {
        setInfo(
          created.message ||
            "Alta registrada en PENDING — mando superior debe autorizar",
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  const pending = users.filter((u) => u.status === "pending");

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <PageIntro module="usuarios" title="Directorio de accesos" />
        <HowToBox
          steps={[
            "Crea usuario con email, clave y rol operativo.",
            "Si el rol es de mando igual o superior al tuyo, queda PENDING hasta autorización.",
            "Org admin puede modificar, resetear clave o desactivar usuarios de su empresa.",
          ]}
        />
      </div>

      {pending.length > 0 ? (
        <div className="fsg-panel space-y-3 border-[var(--brand-amber)]/40 p-4">
          <div className="font-display text-sm font-semibold text-[var(--brand-amber)]">
            Altas pendientes de autorización ({pending.length})
          </div>
          <ul className="space-y-2">
            {pending.map((u) => (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--brand-line)] pb-2 last:border-0"
              >
                <div>
                  <div className="text-sm font-medium">{u.name}</div>
                  <div className="font-data text-xs text-[var(--brand-mute)]">
                    {u.email} · {ROLE_LABELS[u.role] ?? u.role}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="primary"
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
        </div>
      ) : null}

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-5"
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
          className="field"
          placeholder="Email"
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
        <Button type="submit" variant="primary" data-testid="usuarios-submit">
          Dar de alta
        </Button>
      </form>

      {error ? <p className="text-sm text-[var(--brand-signal)]">{error}</p> : null}
      {info ? <p className="text-sm text-[var(--brand-amber)]">{info}</p> : null}

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Directorio ({users.length})
          {isMaster ? " · empresa activa" : ""}
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Email</th>
              {isMaster ? <th className="px-4 py-2">Empresa</th> : null}
              <th className="px-4 py-2">Rol</th>
              <th className="px-4 py-2">Estado</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--brand-line)]">
                <td className="px-4 py-2.5">
                  <input
                    className="field py-1 text-xs"
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
                </td>
                <td className="px-4 py-2.5">
                  <input
                    className="field py-1 text-xs font-data"
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
                </td>
                {isMaster ? (
                  <td className="px-4 py-2.5 font-data text-xs text-[var(--brand-mute)]">
                    {u.organization?.name ?? "—"}
                  </td>
                ) : null}
                <td className="px-4 py-2.5">
                  <select
                    className="field py-1 text-xs"
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
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    tone={
                      u.status === "pending"
                        ? "amber"
                        : u.active
                          ? "emerald"
                          : "rose"
                    }
                  >
                    {u.status === "pending"
                      ? "PENDING"
                      : u.active
                        ? "ACTIVO"
                        : "INACTIVO"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const pwd = prompt("Nueva clave para el usuario:", "Fleet2026*");
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
