"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { ROLE_LABELS, ROLES, type Role } from "@fsg/shared";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("fsg2026");
  const [role, setRole] = useState<Role>("despacho");
  const [error, setError] = useState("");

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
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <div>
        <PageIntro module="usuarios" title="Quién puede entrar" />
        <HowToBox
          steps={[
            "Crea un usuario con email, clave y rol.",
            "Esa persona verá solo los menús de su rol al iniciar sesión.",
            "Puedes cambiar el rol después o desactivar la cuenta.",
          ]}
        />
      </div>

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-5"
      >
        <input
          className="field"
          placeholder="Nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="field"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select
          className="field"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="primary">
          Crear usuario
        </Button>
      </form>

      {error ? <p className="text-sm text-[var(--brand-signal)]">{error}</p> : null}

      <div className="fsg-panel data-shell overflow-hidden">
        <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
          Directorio ({users.length})
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2">Nombre</th>
              <th className="px-4 py-2">Email</th>
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
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <Badge tone={u.active ? "emerald" : "rose"}>
                    {u.active ? "ACTIVO" : "INACTIVO"}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const pwd = prompt("Nueva clave para el usuario:", "fsg2026");
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
                            body: JSON.stringify({ active: true }),
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
