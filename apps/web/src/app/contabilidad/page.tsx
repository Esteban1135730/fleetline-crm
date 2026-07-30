"use client";

import { FormEvent, useEffect, useState } from "react";
import { Badge, Button } from "@fsg/ui";
import { api } from "@/lib/api";
import { HowToBox, PageIntro } from "@/components/page-intro";

type Account = { id: string; code: string; name: string };

type AccountRow = {
  id: string;
  code: string;
  name: string;
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

export default function ContabilidadPage() {
  const [balance, setBalance] = useState<AccountRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [description, setDescription] = useState("");
  const [debitAccountId, setDebitAccountId] = useState("");
  const [creditAccountId, setCreditAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    type: "ASSET",
  });

  async function load() {
    const [b, e, a] = await Promise.all([
      api<AccountRow[]>("/accounting/trial-balance"),
      api<Entry[]>("/accounting/journal"),
      api<Account[]>("/accounting/accounts"),
    ]);
    setBalance(b);
    setEntries(e);
    setAccounts(a);
    if (!debitAccountId && a[0]) setDebitAccountId(a[0].id);
    if (!creditAccountId && a[1]) setCreditAccountId(a[1].id);
  }

  useEffect(() => {
    void load().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const value = Number(amount);
      await api("/accounting/journal", {
        method: "POST",
        body: JSON.stringify({
          description,
          lines: [
            { accountId: debitAccountId, debit: value, credit: 0 },
            { accountId: creditAccountId, debit: 0, credit: value },
          ],
        }),
      });
      setDescription("");
      setAmount("");
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear cuenta");
    }
  }

  const totalDebit = balance.reduce((s, r) => s + r.debit, 0);
  const totalCredit = balance.reduce((s, r) => s + r.credit, 0);

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-6">
      <PageIntro module="contabilidad" title="Libro mayor" />
      <HowToBox
        steps={[
          "Crea un asiento con cuenta débito, crédito y el mismo valor (partida doble).",
          "El balance de prueba se calcula solo con asientos publicados.",
          "Si débitos ≠ créditos, la API rechaza el asiento.",
        ]}
      />

      <form
        onSubmit={onCreate}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-5"
      >
        <input
          className="field md:col-span-2"
          placeholder="Descripción del asiento"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
        />
        <select
          className="field"
          value={debitAccountId}
          onChange={(e) => setDebitAccountId(e.target.value)}
          required
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              Débito · {a.code} {a.name}
            </option>
          ))}
        </select>
        <select
          className="field"
          value={creditAccountId}
          onChange={(e) => setCreditAccountId(e.target.value)}
          required
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              Crédito · {a.code} {a.name}
            </option>
          ))}
        </select>
        <input
          className="field"
          type="number"
          placeholder="Valor COP"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Button type="submit" variant="primary" className="md:col-span-5">
          Publicar asiento
        </Button>
        {error ? (
          <p className="text-sm text-[var(--brand-signal)] md:col-span-5">
            {error}
          </p>
        ) : null}
      </form>

      <form
        onSubmit={onCreateAccount}
        className="fsg-panel grid grid-cols-1 gap-3 p-4 md:grid-cols-4"
      >
        <input
          className="field"
          placeholder="Código cuenta"
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
        <Button type="submit" variant="primary">
          Crear cuenta
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="fsg-panel data-shell overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--brand-line)] px-4 py-3">
            <span className="font-display text-sm font-semibold">
              Balance de prueba
            </span>
            <Badge
              tone={Math.abs(totalDebit - totalCredit) < 1 ? "emerald" : "rose"}
            >
              Δ {(totalDebit - totalCredit).toLocaleString("es-CO")}
            </Badge>
          </div>
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
                  <td className="px-4 py-2.5">
                    <span className="font-data text-xs text-[var(--brand-primary)]">
                      {r.code}
                    </span>{" "}
                    {r.name}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {r.debit ? r.debit.toLocaleString("es-CO") : "—"}
                  </td>
                  <td className="px-4 py-2.5 font-data text-xs">
                    {r.credit ? r.credit.toLocaleString("es-CO") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="fsg-panel overflow-hidden">
          <div className="border-b border-[var(--brand-line)] px-4 py-3 font-display text-sm font-semibold">
            Asientos contables ({entries.length})
          </div>
          <div className="divide-y divide-[var(--brand-line)]">
            {entries.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <span className="font-data text-xs text-[var(--brand-primary)]">
                      {e.number}
                    </span>
                    <p className="text-sm font-medium text-[var(--brand-ink)]">
                      {e.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.status === "VOID" ? "rose" : "emerald"}>
                      {e.status}
                    </Badge>
                    {e.status !== "VOID" ? (
                      <Button
                        variant="ghost"
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
                <ul className="space-y-1 text-xs text-[var(--brand-muted)]">
                  {e.lines.map((l, idx) => (
                    <li key={idx} className="flex justify-between font-data">
                      <span>
                        {l.account.code} {l.account.name}
                      </span>
                      <span>
                        D {Number(l.debit).toLocaleString("es-CO")} / C{" "}
                        {Number(l.credit).toLocaleString("es-CO")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
