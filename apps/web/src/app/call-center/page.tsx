"use client";

import { useState } from "react";
import { Tooltip } from "@fsg/ui";
import AtencionPanel from "@/components/call-center/atencion-panel";
import RecepcionPanel from "@/components/call-center/recepcion-panel";

type Tab = "call" | "recepcion";

export default function CallCenterPage() {
  const [tab, setTab] = useState<Tab>("call");

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-4">
      <header className="border-b border-brand-border pb-4">
        <p className="font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-primary">
          Call Center
        </p>
        <h1 className="font-sans text-2xl font-semibold tracking-tight text-brand-text-primary md:text-3xl">
          Recepción y centro de llamadas
        </h1>
      </header>
      <div className="flex flex-wrap gap-2">
        <Tooltip content="Tickets de atención al cliente y asignación de agentes">
          <button
            type="button"
            className={`flt-nav-item !inline-flex !w-auto px-4 transition-all duration-150 ease-in-out ${tab === "call" ? "is-active" : ""}`}
            onClick={() => setTab("call")}
          >
            Centro de llamadas
          </button>
        </Tooltip>
        <Tooltip content="Ingreso y salida de visitantes en sede">
          <button
            type="button"
            className={`flt-nav-item !inline-flex !w-auto px-4 transition-all duration-150 ease-in-out ${tab === "recepcion" ? "is-active" : ""}`}
            onClick={() => setTab("recepcion")}
          >
            Recepción
          </button>
        </Tooltip>
      </div>
      {tab === "call" ? <AtencionPanel /> : <RecepcionPanel />}
    </div>
  );
}
