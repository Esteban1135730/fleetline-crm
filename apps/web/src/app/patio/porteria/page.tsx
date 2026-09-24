"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { Ban, CheckCircle2, LogOut, ScanLine, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  classifyGateQuery,
  patioBlockLabel,
} from "@/lib/patio-blocks";

type GateDecision = {
  decision: "ENTRA" | "NO_ENTRA";
  subjectType?: "VEHICLE" | "DRIVER" | "VISITOR" | "UNKNOWN";
  plate?: string | null;
  document?: string | null;
  vehicleId?: string | null;
  driver?: { id: string; name: string; document: string } | null;
  visitor?: {
    id: string;
    name: string;
    hostName?: string | null;
    boardStatus?: string | null;
  } | null;
  trip?: {
    id: string;
    code: string;
    status: string;
    departAt?: string;
  } | null;
  reasons: string[];
  accessLogId?: string | null;
  gateOpened: boolean;
  message: string;
};

type Direction = "IN" | "OUT";

const CLEAR_MS = 12_000;

export default function PorteriaGatePage() {
  const { user, logout } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState<Direction>("OUT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GateDecision | null>(null);

  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  function scheduleClear() {
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => {
      setResult(null);
      setError(null);
      setQuery("");
      focusInput();
    }, CLEAR_MS);
  }

  async function runCheck(raw: string) {
    const classified = classifyGateQuery(raw);
    if (!classified.plate && !classified.document) {
      setError("Ingrese una placa o cédula");
      focusInput();
      return;
    }

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post<GateDecision>(
        "/api/v1/patio/talanquera/gate-decision",
        {
          ...classified,
          direction,
          gateId: "GATE-PORTERIA",
        },
        { confirm: { skip: true } },
      );
      setResult(res);
      setQuery("");
      scheduleClear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar el acceso");
    } finally {
      setBusy(false);
      focusInput();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runCheck(query);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Lectores de código de barras suelen enviar Enter al final
    if (e.key === "Enter") {
      e.preventDefault();
      void runCheck(query);
    }
  }

  const allowed = result?.decision === "ENTRA";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--brand-canvas)] text-[var(--brand-text-primary)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--brand-border)] px-4 py-3 md:px-8">
        <div>
          <p className="font-data text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--brand-primary)]">
            Control de acceso
          </p>
          <h1 className="font-sans text-xl font-semibold tracking-tight md:text-2xl">
            Portería
          </h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--brand-text-secondary)]">
          <span className="hidden sm:inline">{user?.name}</span>
          <Link
            href="/patio/dashboard"
            className="rounded-lg border border-[var(--brand-border)] px-3 py-2 hover:bg-[var(--brand-surface)]"
          >
            Patio
          </Link>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--brand-border)] px-3 py-2 hover:bg-[var(--brand-surface)]"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "OUT" as const, label: "Salida" },
              { id: "IN" as const, label: "Ingreso" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDirection(opt.id)}
              className={`min-h-12 min-w-[8rem] rounded-xl border px-4 text-sm font-semibold transition ${
                direction === opt.id
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/15 text-[var(--brand-text-primary)]"
                  : "border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-text-secondary)]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-2 flex items-center gap-2 text-sm text-[var(--brand-text-secondary)]">
              <ScanLine className="h-4 w-4" aria-hidden />
              Placa o cédula · teclado o lector
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={onKeyDown}
              disabled={busy}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              placeholder="BOG-892  ·  1001001001"
              className="w-full rounded-2xl border-2 border-[var(--brand-border)] bg-[var(--brand-surface)] px-5 py-5 font-data text-2xl font-semibold tracking-wider text-[var(--brand-text-primary)] outline-none placeholder:text-[var(--brand-text-secondary)]/50 focus:border-[var(--brand-primary)] md:text-3xl"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="min-h-14 w-full rounded-2xl bg-[var(--brand-primary)] px-6 text-lg font-semibold text-[var(--brand-on-primary,var(--brand-contrast-fg,#0a0d14))] disabled:opacity-40"
          >
            {busy ? "Consultando…" : "Verificar acceso"}
          </button>
        </form>

        {error ? (
          <p
            role="alert"
            className="rounded-2xl border border-[var(--brand-danger)]/40 bg-[var(--brand-danger)]/10 px-4 py-3 text-sm text-[var(--brand-danger)]"
          >
            {error}
          </p>
        ) : null}

        {result ? (
          <section
            aria-live="assertive"
            className={`flex flex-1 flex-col items-center justify-center rounded-3xl border-2 px-6 py-10 text-center md:py-16 ${
              allowed
                ? "border-[var(--brand-success)] bg-[var(--brand-success)]/15"
                : "border-[var(--brand-danger)] bg-[var(--brand-danger)]/15"
            }`}
          >
            {allowed ? (
              <CheckCircle2
                className="mb-4 h-16 w-16 text-[var(--brand-success)] md:h-20 md:w-20"
                aria-hidden
              />
            ) : (
              <XCircle
                className="mb-4 h-16 w-16 text-[var(--brand-danger)] md:h-20 md:w-20"
                aria-hidden
              />
            )}
            <p
              className={`font-sans text-5xl font-black tracking-tight md:text-7xl ${
                allowed
                  ? "text-[var(--brand-success)]"
                  : "text-[var(--brand-danger)]"
              }`}
            >
              {allowed ? "ENTRA" : "NO ENTRA"}
            </p>
            <p className="mt-3 max-w-xl text-base text-[var(--brand-text-primary)] md:text-lg">
              {result.message}
            </p>
            <p className="mt-2 font-data text-sm text-[var(--brand-text-secondary)]">
              {result.plate
                ? `Placa ${result.plate}`
                : result.document
                  ? `Doc. ${result.document}`
                  : null}
              {result.driver?.name ? ` · ${result.driver.name}` : null}
              {result.visitor?.name ? ` · ${result.visitor.name}` : null}
              {result.trip?.code ? ` · ${result.trip.code}` : null}
            </p>

            {!allowed && result.reasons?.length ? (
              <ul className="mt-8 w-full max-w-lg space-y-2 text-left">
                <li className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--brand-danger)]">
                  Motivo
                </li>
                {result.reasons.map((code) => (
                  <li
                    key={code}
                    className="flex items-start gap-2 rounded-xl border border-[var(--brand-danger)]/30 bg-[var(--brand-canvas)]/60 px-4 py-3 text-sm md:text-base"
                  >
                    <Ban
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-danger)]"
                      aria-hidden
                    />
                    <span>
                      <span className="font-medium text-[var(--brand-text-primary)]">
                        {patioBlockLabel(code)}
                      </span>
                      <span className="mt-0.5 block font-data text-[10px] text-[var(--brand-text-secondary)]">
                        {code}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            <button
              type="button"
              className="mt-8 text-sm text-[var(--brand-text-secondary)] underline"
              onClick={() => {
                if (clearTimer.current) clearTimeout(clearTimer.current);
                setResult(null);
                setQuery("");
                focusInput();
              }}
            >
              Nueva consulta
            </button>
          </section>
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-3xl border border-dashed border-[var(--brand-border)] px-6 py-16 text-center text-[var(--brand-text-secondary)]">
            <p className="max-w-sm text-sm md:text-base">
              Escanee o escriba la placa / cédula y pulse Enter. El resultado
              ENTRA o NO ENTRA aparece aquí de inmediato.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
