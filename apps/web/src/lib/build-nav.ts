import {
  NAV_DEPARTMENTS,
  ROLE_CURATED_NAV,
  ROLE_VIEWS,
  hubForModule,
  normalizeRole,
  type ModuleId,
  type NavDepartment,
  type NavDeptItem,
  type Role,
} from "@fsg/shared";

/**
 * Solo pantallas independientes en el sidebar.
 * Href con # = sección interna del dashboard → no se lista.
 */
function isIndependentHref(href: string): boolean {
  return !href.includes("#");
}

/** Deduplica por ruta base (sin query/hash). */
function dedupeByPath(items: NavDeptItem[]): NavDeptItem[] {
  const seen = new Set<string>();
  const out: NavDeptItem[] = [];
  for (const item of items) {
    const key = item.href.split("#")[0].split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, href: key });
  }
  return out;
}

/**
 * Construye el menú lateral: 6 hubs, solo opciones permitidas
 * por ROLE_VIEWS. Si el rol tiene menú curado (*_NAV), se reutiliza
 * y se agrupa en hubs (sin inventar permisos nuevos).
 */
export function buildNavDepartmentsForRole(
  role: string | Role,
): NavDepartment[] {
  const key = normalizeRole(String(role));
  const allowed = new Set(ROLE_VIEWS[key] || []);

  const curated = ROLE_CURATED_NAV[key];
  if (curated?.length) {
    const items = dedupeByPath(
      curated
        .filter(
          (i) =>
            isIndependentHref(i.href) &&
            (i.view === "cuenta" || allowed.has(i.view as ModuleId)),
        )
        .map((i) => ({
          href: i.href,
          view: i.view as ModuleId,
          label: i.label,
          tip: i.tip,
        })),
    );
    return groupItemsIntoHubs(items);
  }

  return NAV_DEPARTMENTS.map((dept) => ({
    ...dept,
    items: dedupeByPath(
      dept.items.filter(
        (item) =>
          isIndependentHref(item.href) &&
          (item.view === "cuenta" || allowed.has(item.view as ModuleId)),
      ),
    ),
  })).filter((dept) => dept.items.length > 0);
}

function groupItemsIntoHubs(items: NavDeptItem[]): NavDepartment[] {
  const byHub = new Map<string, NavDeptItem[]>();
  for (const item of items) {
    const hubId = hubForModule(item.view);
    const list = byHub.get(hubId) || [];
    list.push(item);
    byHub.set(hubId, list);
  }

  return NAV_DEPARTMENTS.map((hub) => {
    const hubItems = byHub.get(hub.id);
    if (!hubItems?.length) return null;
    return {
      id: hub.id,
      label: hub.label,
      tip: hub.tip,
      items: hubItems,
    };
  }).filter((d): d is NavDepartment => d != null);
}
