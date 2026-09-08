import { resolveModuleId } from "@fsg/shared";
import { guideForPath } from "@/lib/module-guides";

export type TourStep = {
  /** CSS selector; si falta y optional=true, se omite el paso */
  selector: string;
  title: string;
  body: string;
  optional?: boolean;
  /** Alinear tarjeta del tour */
  placement?: "auto" | "top" | "bottom" | "left" | "right";
};

export type TourDefinition = {
  id: string;
  title: string;
  steps: TourStep[];
};

/** ID estable por área / ruta */
export function tourIdForPath(pathname: string): string {
  const seg = pathname.split("/").filter(Boolean)[0] || "dashboard";
  if (seg === "cuenta") return "cuenta";
  if (seg === "login") return "login";
  const resolved = resolveModuleId(seg);
  return resolved || seg || "dashboard";
}

const SHELL_TOUR: TourDefinition = {
  id: "shell",
  title: "Bienvenida a NEXA OS",
  steps: [
    {
      selector: '[data-tour="sidebar"], .flt-sidebar, nav[aria-label]',
      title: "Áreas corporativas",
      body: "Navegue las 17 áreas desde el menú lateral. Puede dejar varias abiertas; el sistema recuerda su preferencia.",
      placement: "right",
    },
    {
      selector: '[data-tour="search"], .flt-search-trigger',
      title: "Búsqueda global",
      body: "Localice placa, conductor, cliente o módulo con Cmd/Ctrl+K sin salir de la pantalla.",
      placement: "bottom",
    },
    {
      selector: '[data-tour="help"], .flt-help-btn',
      title: "Ayuda contextual",
      body: "El botón [?] abre el protocolo de 3 pasos del área activa. Atajo: Cmd/Ctrl+/.",
      placement: "bottom",
    },
    {
      selector: '[data-tour="workbench"], .flt-workbench',
      title: "Área de trabajo",
      body: "Aquí operan KPIs, filtros y tablas. Los formularios largos salen en paneles laterales o modales.",
      placement: "left",
    },
    {
      selector: '[data-tour="user"], .flt-user-chip',
      title: "Su perfil",
      body: "En Mi cuenta puede repetir este recorrido o desactivar el inicio automático al entrar a cada área.",
      placement: "bottom",
    },
  ],
};

/**
 * Recorrido del módulo activo:
 * 1) badge de área
 * 2–4) anclas data-tour del módulo (si existen) + copy de MODULE_GUIDES
 * 5) workbench fallback
 * 6) ayuda
 */
export function buildModuleTour(pathname: string): TourDefinition {
  const id = tourIdForPath(pathname);
  const guide = guideForPath(pathname);

  return {
    id,
    title: guide.title,
    steps: [
      {
        selector: '[data-tour="module"], .flt-module-badge',
        title: guide.title,
        body: guide.summary,
        placement: "bottom",
      },
      {
        selector: '[data-tour="kpi"], [data-tour="primary"]',
        title: "Paso 1 · Señales",
        body: guide.steps[0],
        optional: true,
        placement: "bottom",
      },
      {
        selector: '[data-tour="filters"], [data-tour="secondary"], [data-tour="toolbar"]',
        title: "Paso 2 · Operación",
        body: guide.steps[1],
        optional: true,
        placement: "bottom",
      },
      {
        selector:
          '[data-tour="table"], [data-tour="panel"], [data-tour="list"], [data-testid="panel-servicios"], [data-testid="panel-conductores"], [data-testid="rrhh-panel-personal"]',
        title: "Paso 3 · Datos",
        body: guide.steps[2],
        optional: true,
        placement: "top",
      },
      {
        selector: '[data-tour="workbench"], .flt-workbench',
        title: "Área de trabajo",
        body: `${guide.steps[0]} ${guide.steps[1]} ${guide.steps[2]}`,
        optional: true,
        placement: "left",
      },
      {
        selector: '[data-tour="help"], .flt-help-btn',
        title: "Repetir guía",
        body: "Abra [?] para el protocolo escrito, o reactive el recorrido desde Mi cuenta.",
        placement: "bottom",
      },
    ],
  };
}

export function getShellTour(): TourDefinition {
  return SHELL_TOUR;
}

export function resolveTour(
  kind: "shell" | "module",
  pathname: string,
): TourDefinition {
  return kind === "shell" ? getShellTour() : buildModuleTour(pathname);
}
