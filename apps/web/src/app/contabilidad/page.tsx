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
import { EmptyState, KpiCard, SlideOver } from "@/components/audit";
import { BentoPanel } from "@/components/nexa/bento-panel";
import { NexaTable, NexaRow, NexaCell } from "@/components/nexa/nexa-table";

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
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
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
  const [accountOpen, setAccountOpen] = useState(false);
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
    const patrimonio =
      net("EQUITY", true) + net("INCOME", true) - net("EXPENSE", false);
    const totalDebit = balance.reduce((s, r) => s + r.debit, 0);
    const totalCredit = balance.reduce((s, r) => s + r.credit, 0);
    const delta = totalDebit - totalCredit;
    return { activos, pasivos, patrimonio, totalDebit, totalCredit, delta };
  }, [balance]);

  const journalRows = useMemo(
    () =>
      entries.flatMap((e) =>
        e.lines.map((l, idx) => ({
          entryId: e.id,
          number: e.number,
          description: e.description,
          status: e.status,
          lineIdx: idx,
          accountCode: l.account.code,
          accountName: l.account.name,
          debit: Number(l.debit),
          credit: Number(l.credit),
          periodLocked:
            period?.status === "SOFT_CLOSED" || period?.status === "HARD_LOCKED",
        })),
      ),
    [entries, period],
  );

  const lineDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const lineCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = lineDebit > 0 && Math.abs(lineDebit - lineCredit) < 0.01;
  const periodLocked =
    period?.status === "SOFT_CLOSED" || period?.status === "HARD_LOCKED";
  const canReopen = period?.status === "SOFT_CLOSED";

  async function onCreateEntry(e: FormEvent, asDraft = false) {
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
        body: JSON.stringify({ description, lines: payload, asDraft }),
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
      setAccountOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta");
    }
  }

  async function closeMonth() {
    if (
      !confirm(
        "¿Cerrar el mes? No se podrán publicar ni anular asientos del periodo. Puede reabrirse mientras no esté en Hard Lock de Revisoría.",
      )
    ) {
      return;
    }
    setError("");
    try {
      const res = await api<{ message: string }>("/accounting/period/close", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      window.alert(res.message || "Periodo cerrado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar el mes");
    }
  }

  async function reopenMonth() {
    if (!confirm("¿Reabrir el periodo? Se habilitarán asientos nuevamente.")) {
      return;
    }
    setError("");
    try {
      const res = await api<{ message: string }>("/accounting/period/reopen", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      window.alert(res.message || "Periodo reabierto");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reabrir");
    }
  }

  async function voidEntry(entryId: string, number: string) {
    if (!confirm(`¿Anular asiento ${number}?`)) return;
    await api(`/accounting/journal/${entryId}/void`, { method: "PATCH" });
    await load();
  }

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border pb-4">
        <div>
          <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
            Contabilidad · NIIF
          </p>
          <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
            Libro mayor y balances
          </h1>
          <p className="mt-1 font-sans text-sm text-brand-text-secondary">
            PUC · partida doble · cierre de periodo
          </p>
        </div>
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
          {canReopen ? (
            <Button
              type="button"
              variant="secondary"
              className="w-auto px-4 py-2"
              onClick={() => void reopenMonth()}
            >
              Reabrir periodo
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            className="w-auto px-4 py-2"
            onClick={() => setAccountOpen(true)}
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
      </header>

      {periodLocked ? (
        <p
          role="status"
          className="rounded-lg border border-brand-warning/35 bg-brand-warning/10 px-3 py-2 text-sm text-brand-warning"
        >
          Periodo {period?.yearMonth} {statusEs(period?.status ?? "")} — edición
          bloqueada.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-brand-danger">
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
        <BentoPanel
          title="Balance de prueba (PUC)"
          subtitle="Débitos y créditos acumulados"
          icon={<BookOpen aria-hidden />}
          action={
            <Badge tone={Math.abs(macros.delta) < 1 ? "success" : "danger"}>
              Δ {macros.delta.toLocaleString("es-CO")}
            </Badge>
          }
        >
          {balance.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7" aria-hidden />}
              title="Sin movimientos en balance"
              description="Publica asientos para construir el balance de prueba."
            />
          ) : (
            <NexaTable columns={["Cuenta", "Débito", "Crédito"]}>
              {balance.map((r) => (
                <NexaRow key={r.id}>
                  <NexaCell className={accountIndent(r.code)}>
                    <span className="font-data text-xs text-brand-primary">
                      {r.code}
                    </span>{" "}
                    {r.name}
                  </NexaCell>
                  <NexaCell mono>
                    {r.debit ? r.debit.toLocaleString("es-CO") : "—"}
                  </NexaCell>
                  <NexaCell mono>
                    {r.credit ? r.credit.toLocaleString("es-CO") : "—"}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>

        <BentoPanel
          title="Asientos contables"
          subtitle={`${entries.length} publicados`}
          icon={<FileSpreadsheet aria-hidden />}
        >
          {entries.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="h-7 w-7" aria-hidden />}
              title="Sin asientos publicados"
              description="Abre el panel de partida doble para el primer asiento."
              actionLabel="Nuevo asiento"
              onAction={() => setEntryOpen(true)}
            />
          ) : (
            <NexaTable
              columns={[
                "Asiento",
                "Descripción",
                "Cuenta",
                "Débito",
                "Crédito",
                "Estado",
                "",
              ]}
            >
              {journalRows.map((row, idx) => (
                <NexaRow key={`${row.entryId}-${row.lineIdx}-${idx}`}>
                  <NexaCell mono className="text-xs text-brand-primary">
                    {row.lineIdx === 0 ? row.number : ""}
                  </NexaCell>
                  <NexaCell className="text-xs">
                    {row.lineIdx === 0 ? row.description : ""}
                  </NexaCell>
                  <NexaCell mono className="text-xs">
                    {row.accountCode}{" "}
                    <span className="font-sans text-brand-text-secondary">
                      {row.accountName}
                    </span>
                  </NexaCell>
                  <NexaCell mono>
                    {row.debit ? row.debit.toLocaleString("es-CO") : "—"}
                  </NexaCell>
                  <NexaCell mono>
                    {row.credit ? row.credit.toLocaleString("es-CO") : "—"}
                  </NexaCell>
                  <NexaCell>
                    {row.lineIdx === 0 ? (
                      <Badge tone={row.status === "VOID" ? "danger" : "success"}>
                        {statusEs(row.status)}
                      </Badge>
                    ) : null}
                  </NexaCell>
                  <NexaCell>
                    {row.lineIdx === 0 &&
                    row.status !== "VOID" &&
                    !row.periodLocked ? (
                      <Button
                        variant="ghost"
                        className="w-auto text-xs"
                        onClick={() => void voidEntry(row.entryId, row.number)}
                      >
                        Anular
                      </Button>
                    ) : null}
                  </NexaCell>
                </NexaRow>
              ))}
            </NexaTable>
          )}
        </BentoPanel>
      </div>

      <SlideOver
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title="Crear cuenta contable"
        description="Alta de cuenta en el plan contable operativo."
        widthClass="max-w-md"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              onClick={() => setAccountOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="create-account-form"
              variant="primary"
              className="w-auto px-4 py-2"
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
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Código PUC
            <input
              className="field font-data tabular-nums"
              placeholder="1110"
              value={accountForm.code}
              onChange={(e) =>
                setAccountForm({ ...accountForm, code: e.target.value })
              }
              required
            />
          </label>
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Nombre cuenta
            <input
              className="field"
              placeholder="Bancos"
              value={accountForm.name}
              onChange={(e) =>
                setAccountForm({ ...accountForm, name: e.target.value })
              }
              required
            />
          </label>
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
            Tipo
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
          </label>
        </form>
      </SlideOver>

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
              className="w-auto px-4 py-2"
              onClick={() => setEntryOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-auto px-4 py-2"
              disabled={!isBalanced}
              onClick={(e) => void onCreateEntry(e as unknown as FormEvent, true)}
            >
              Guardar borrador
            </Button>
            <Button
              type="submit"
              form="journal-multiline-form"
              variant="primary"
              className="w-auto px-4 py-2"
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
          <label className="flex flex-col gap-1 font-data text-[10px] uppercase tracking-wider text-brand-text-secondary">
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
                className="grid grid-cols-12 items-end gap-2 rounded-lg border border-brand-border p-2"
              >
                <label className="col-span-12 font-data text-[10px] uppercase text-brand-text-secondary sm:col-span-6">
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
                <label className="col-span-5 font-data text-[10px] uppercase text-brand-text-secondary sm:col-span-2">
                  Débito
                  <input
                    className="field mt-1 w-full font-data tabular-nums"
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
                <label className="col-span-5 font-data text-[10px] uppercase text-brand-text-secondary sm:col-span-2">
                  Crédito
                  <input
                    className="field mt-1 w-full font-data tabular-nums"
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
                        setLines((rows) =>
                          rows.filter((r) => r.key !== line.key),
                        )
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
                ? "border-brand-primary/35"
                : "border-brand-danger/35"
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
                isBalanced ? "text-brand-primary" : "text-brand-danger"
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
