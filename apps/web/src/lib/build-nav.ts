import {
  NAV_DEPARTMENTS,
  ROLE_CURATED_NAV,
  ROLE_VIEWS,
  hubForModule,
  isPathDeniedForRole,
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

function isNavAllowedForRole(role: string, item: NavDeptItem): boolean {
  if (!isIndependentHref(item.href)) return false;
  if (item.view === "cuenta") return true;
  if (isPathDeniedForRole(role, item.href)) return false;
  return true;
}

/**
 * Construye el menú lateral: hubs solo con opciones permitidas
 * por ROLE_VIEWS y sin rutas en ROLE_DENIED_PATH_PREFIXES.
 * Si el rol tiene menú curado (*_NAV), se reutiliza y se agrupa en hubs.
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
            (i.view === "cuenta" || allowed.has(i.view as ModuleId)) &&
            isNavAllowedForRole(key, {
              href: i.href,
              view: i.view as ModuleId,
              label: i.label,
              tip: i.tip,
            }),
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
          (item.view === "cuenta" || allowed.has(item.view as ModuleId)) &&
          isNavAllowedForRole(key, item),
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
