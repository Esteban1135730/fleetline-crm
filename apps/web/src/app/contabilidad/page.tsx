"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import {
  BookOpen,
  CheckCircle,
  FileSpreadsheet,
  Landmark,
  Lock,
  Plus,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { statusEs } from "@fsg/shared";
import { PageIntro } from "@/components/page-intro";
import { EmptyState, KpiCard, Modal, SlideOver } from "@/components/audit";

type Account = { id: string; code: string; name: string; type?: string };

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type?: string;
  debit: number;
  credit: number;
};

type Entry = {
  id: string;
  number: string;
  description: string;
  status: string;
  lines: {
    debit: string | number;
    credit: string | number;
    account: { code: string; name: string };
  }[];
};

type EntryLine = {
  key: string;
  accountId: string;
  debit: string;
  credit: string;
};

type PeriodInfo = {
  yearMonth: string;
  status: string;
  hardLockedAt?: string | null;
};

function formatCop(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function accountIndent(code: string) {
  const len = code.replace(/\D/g, "").length;
  if (len <= 1) return "pl-0 font-bold";
  if (len <= 2) return "pl-3 font-semibold";
  return "pl-6";
}

function emptyLines(): EntryLine[] {
  return [
    { key: "l1", accountId: "", debit: "", credit: "" },
    { key: "l2", accountId: "", debit: "", credit: "" },
  ];
}

export default function ContabilidadPage() {
  const [balance, setBalance] = useState<AccountRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [period, setPeriod] = useState<PeriodInfo | null>(null);
  const [error, setError] = useState("");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<EntryLine[]>(emptyLines);
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    type: "ASSET",
  });

  async function load() {
    const [b, e, a, p] = await Promise.all([
      api<AccountRow[]>("/accounting/trial-balance"),
      api<Entry[]>("/accounting/journal"),
      api<Account[]>("/accounting/accounts"),
      api<PeriodInfo>("/accounting/period").catch(() => null),
    ]);
    setBalance(b);
    setEntries(e);
    setAccounts(a);
    setPeriod(p);
  }

  useEffect(() => {
    void load().catch(console.error);
  }, []);

  const macros = useMemo(() => {
    const net = (type: string, invert: boolean) =>
      balance
        .filter((r) => r.type === type)
        .reduce((s, r) => {
          const n = invert ? r.credit - r.debit : r.debit - r.credit;
          return s + n;
        }, 0);
    const activos = net("ASSET", false);
    const pasivos = net("LIABILITY", true);
    const patrimonio = net("EQUITY", true) + net("INCOME", true) - net("EXPENSE", false);
    const totalDebit = balance.reduce((s, r) => s + r.debit, 0);
    const totalCredit = balance.reduce((s, r) => s + r.credit, 0);
    const delta = totalDebit - totalCredit;
    return { activos, pasivos, patrimonio, totalDebit, totalCredit, delta };
  }, [balance]);

  const lineDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const lineCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = lineDebit > 0 && Math.abs(lineDebit - lineCredit) < 0.01;
  const periodLocked =
    period?.status === "SOFT_CLOSED" || period?.status === "HARD_LOCKED";

  async function onCreateEntry(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = lines
      .map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      }))
      .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));
    try {
      await api("/accounting/journal", {
        method: "POST",
        body: JSON.stringify({ description, lines: payload }),
      });
      setDescription("");
      setLines(emptyLines());
      setEntryOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear asiento");
    }
  }

  async function onCreateAccount(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/accounting/accounts", {
        method: "POST",
        body: JSON.stringify(accountForm),
      });
      setAccountForm({ code: "", name: "", type: "ASSET" });
      setAccountModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta");
    }
  }

  async function closeMonth() {
    if (!confirm("¿Cerrar el mes? No se podrán publicar ni anular asientos del periodo.")) {
      return;
    }
    setError("");
    try {
      const res = await api<{ message: string }>("/accounting/period/close", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setError("");
      await load();
      window.alert(res.message || "Periodo cerrado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar el mes");
    }
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro
        module="contabilidad"
        title="Libro mayor y balances"
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              disabled={periodLocked}
              onClick={() => void closeMonth()}
            >
              <Lock className="mr-1.5 inline h-4 w-4" aria-hidden />
              Cerrar mes
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => setAccountModalOpen(true)}
            >
              <Plus className="mr-1.5 inline h-4 w-4" aria-hidden />
              Crear cuenta
            </Button>
            <Button
              type="button"
              variant="primary"
              className="w-auto px-4 py-2"
              disabled={periodLocked}
              onClick={() => {
                setError("");
                setEntryOpen(true);
              }}
            >
              <FileSpreadsheet className="mr-1.5 inline h-4 w-4" aria-hidden />
              Nuevo asiento
            </Button>
          </div>
        }
      />

      {periodLocked ? (
        <p
          role="status"
          className="rounded-lg border border-[color-mix(in_srgb,var(--accent-metric)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent-metric)_8%,transparent)] px-3 py-2 text-sm text-[var(--accent-metric)]"
        >
          Periodo {period?.yearMonth} {statusEs(period?.status ?? "")} — edición
          bloqueada.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-[var(--brand-signal)]">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Total activos"
          value={formatCop(macros.activos)}
          tone="ok"
          icon={<Landmark className="h-10 w-10" />}
        />
        <KpiCard
          label="Total pasivos"
          value={formatCop(macros.pasivos)}
          tone="warn"
        />
        <KpiCard
          label="Patrimonio neto"
          value={formatCop(macros.patrimonio)}
          tone="neutral"
          icon={<TrendingUp className="h-10 w-10" />}
        />
        <KpiCard
          label="Estado de cuadre"
          value={Math.abs(macros.delta) < 1 ? "CUADRADO" : "DESCUADRE"}
          delta={`Δ ${formatCop(macros.delta)}`}
          tone={Math.abs(macros.delta) < 1 ? "ok" : "danger"}
          icon={<CheckCircle className="h-10 w-10" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="fsg-panel data-shell overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
            <span className="font-display text-sm font-semibold">
              Balance de prueba (PUC)
            </span>
            <Badge
              tone={Math.abs(macros.delta) < 1 ? "emerald" : "rose"}
            >
              Δ {macros.delta.toLocaleString("es-CO")}
            </Badge>
          </div>
          {balance.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<BookOpen className="h-7 w-7" aria-hidden />}
                title="Sin movimientos en balance"
                description="Publica asientos para construir el balance de prueba."
              />
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2">Cuenta</th>
                  <th className="px-4 py-2">Débito</th>
                  <th className="px-4 py-2">Crédito</th>
                </tr>
              </thead>
              <tbody>
                {balance.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--brand-line)]">
                    <td className={`px-4 py-2.5 ${accountIndent(r.code)}`}>
                      <span className="font-data text-xs text-[var(--brand-primary)]">
                        {r.code}
                      </span>{" "}
                      {r.name}
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs tabular-nums">
                      {r.debit ? r.debit.toLocaleString("es-CO") : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-data text-xs tabular-nums">
                      {r.credit ? r.credit.toLocaleString("es-CO") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="fsg-panel overflow-hidden">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Asientos contables ({entries.length})
          </div>
          {entries.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<FileSpreadsheet className="h-7 w-7" aria-hidden />}
                title="Sin asientos publicados"
                description="Abre el panel de partida doble dinámica para el primer asiento."
                actionLabel="Nuevo asiento"
                onAction={() => setEntryOpen(true)}
              />
            </div>
          ) : (
            <div className="divide-y divide-[var(--brand-line)]">
              {entries.map((e) => (
                <div key={e.id} className="px-4 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-data text-xs text-[var(--brand-primary)]">
                        {e.number}
                      </span>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {e.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={e.status === "VOID" ? "rose" : "emerald"}>
                        {statusEs(e.status)}
                      </Badge>
                      {e.status !== "VOID" && !periodLocked ? (
                        <Button
                          variant="ghost"
                          className="w-auto"
                          onClick={async () => {
                            if (!confirm(`¿Anular asiento ${e.number}?`)) return;
                            await api(`/accounting/journal/${e.id}/void`, {
                              method: "PATCH",
                            });
                            await load();
                          }}
                        >
                          Anular
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
                    {e.lines.map((l, idx) => (
                      <li key={idx} className="flex justify-between font-data">
                        <span>
                          {l.account.code} {l.account.name}
                        </span>
                        <span className="tabular-nums">
                          D {Number(l.debit).toLocaleString("es-CO")} / C{" "}
                          {Number(l.credit).toLocaleString("es-CO")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title="Crear cuenta contable"
        description="Alta de cuenta en el plan contable operativo."
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() => setAccountModalOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="create-account-form"
              variant="primary"
              className="w-auto"
            >
              Guardar cuenta
            </Button>
          </>
        }
      >
        <form
          id="create-account-form"
          onSubmit={onCreateAccount}
          className="grid grid-cols-1 gap-3"
        >
          <input
            className="field font-data"
            placeholder="Código PUC"
            value={accountForm.code}
            onChange={(e) =>
              setAccountForm({ ...accountForm, code: e.target.value })
            }
            required
          />
          <input
            className="field"
            placeholder="Nombre cuenta"
            value={accountForm.name}
            onChange={(e) =>
              setAccountForm({ ...accountForm, name: e.target.value })
            }
            required
          />
          <select
            className="field"
            value={accountForm.type}
            onChange={(e) =>
              setAccountForm({ ...accountForm, type: e.target.value })
            }
          >
            <option value="ASSET">Activo</option>
            <option value="LIABILITY">Pasivo</option>
            <option value="EQUITY">Patrimonio</option>
            <option value="INCOME">Ingreso</option>
            <option value="EXPENSE">Gasto</option>
          </select>
        </form>
      </Modal>

      <SlideOver
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Asiento de partida doble"
        description="Partida doble dinámica · débito = crédito para publicar"
        widthClass="max-w-2xl"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() => setEntryOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="journal-multiline-form"
              variant="primary"
              className="w-auto"
              disabled={!isBalanced}
            >
              {isBalanced ? "Publicar asiento" : "Sin cuadre"}
            </Button>
          </>
        }
      >
        <form
          id="journal-multiline-form"
          onSubmit={(e) => void onCreateEntry(e)}
          className="space-y-4"
        >
          <label className="flex flex-col gap-1 text-[11px] uppercase tracking-wide text-[var(--text-secondary)]">
            Descripción / memo
            <input
              className="field"
              placeholder="Ej. Causación nómina agosto + retenciones"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>

          <div className="space-y-2">
            {lines.map((line, idx) => (
              <div
                key={line.key}
                className="grid grid-cols-12 items-end gap-2 rounded-lg border border-[var(--border-subtle)] p-2"
              >
                <label className="col-span-12 text-[10px] uppercase text-[var(--text-secondary)] sm:col-span-6">
                  Cuenta {idx + 1}
                  <select
                    className="field mt-1 w-full"
                    value={line.accountId}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r) =>
                          r.key === line.key
                            ? { ...r, accountId: e.target.value }
                            : r,
                        ),
                      )
                    }
                    required
                  >
                    <option value="">PUC…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-5 text-[10px] uppercase text-[var(--text-secondary)] sm:col-span-2">
                  Débito
                  <input
                    className="field mt-1 w-full font-data"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={line.debit}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r) =>
                          r.key === line.key
                            ? { ...r, debit: e.target.value, credit: "" }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
                <label className="col-span-5 text-[10px] uppercase text-[var(--text-secondary)] sm:col-span-2">
                  Crédito
                  <input
                    className="field mt-1 w-full font-data"
                    type="number"
                    min={0}
                    placeholder="0"
                    value={line.credit}
                    onChange={(e) =>
                      setLines((rows) =>
                        rows.map((r) =>
                          r.key === line.key
                            ? { ...r, credit: e.target.value, debit: "" }
                            : r,
                        ),
                      )
                    }
                  />
                </label>
                <div className="col-span-2 flex justify-end sm:col-span-2">
                  {lines.length > 2 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-auto px-2"
                      onClick={() =>
                        setLines((rows) => rows.filter((r) => r.key !== line.key))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              className="w-auto"
              onClick={() =>
                setLines((rows) => [
                  ...rows,
                  {
                    key: `l${Date.now()}`,
                    accountId: "",
                    debit: "",
                    credit: "",
                  },
                ])
              }
            >
              + Agregar línea
            </Button>
          </div>

          <div
            className={`rounded-lg border p-3 ${
              isBalanced
                ? "border-[color-mix(in_srgb,var(--accent-primary)_35%,transparent)]"
                : "border-[color-mix(in_srgb,var(--accent-alert)_35%,transparent)]"
            }`}
          >
            <div className="flex justify-between font-data text-sm tabular-nums">
              <span>Débito</span>
              <span>{formatCop(lineDebit)}</span>
            </div>
            <div className="mt-1 flex justify-between font-data text-sm tabular-nums">
              <span>Crédito</span>
              <span>{formatCop(lineCredit)}</span>
            </div>
            <p
              className={`mt-2 text-xs font-semibold ${
                isBalanced
                  ? "text-[var(--accent-primary)]"
                  : "text-[var(--accent-alert)]"
              }`}
            >
              {isBalanced
                ? "Partida doble cuadrada — listo para publicar"
                : `Descuadre ${formatCop(lineDebit - lineCredit)}`}
            </p>
          </div>
        </form>
      </SlideOver>
    </div>
  );
}
