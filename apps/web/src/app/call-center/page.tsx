"use client";

import { useState } from "react";
import { Tooltip } from "@fsg/ui";
import { PageIntro } from "@/components/page-intro";
import AtencionPanel from "@/components/call-center/atencion-panel";
import RecepcionPanel from "@/components/call-center/recepcion-panel";

type Tab = "call" | "recepcion";

export default function CallCenterPage() {
  const [tab, setTab] = useState<Tab>("call");

  return (
    <div className="fade-in mx-auto max-w-[1600px] space-y-4">
      <PageIntro module="call_center" title="Recepción y centro de llamadas" />
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
