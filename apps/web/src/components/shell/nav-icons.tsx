import type { ModuleId } from "@fsg/shared";

type IconProps = { className?: string };

function IconFrame({
  children,
  className = "h-4 w-4",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function NavIcon({
  view,
  className,
}: {
  view: ModuleId | "cuenta" | "search" | "collapse" | "close" | "menu";
  className?: string;
}) {
  const c = className;
  switch (view) {
    case "presidencia":
      return (
        <IconFrame className={c}>
          <path d="M4 20h16" />
          <path d="M6 20V10l6-4 6 4v10" />
          <path d="M10 20v-4h4v4" />
        </IconFrame>
      );
    case "gerencia":
      return (
        <IconFrame className={c}>
          <rect x="3" y="7" width="18" height="13" rx="1.5" />
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <path d="M12 11v4" />
          <path d="M10 13h4" />
        </IconFrame>
      );
    case "dashboard":
      return (
        <IconFrame className={c}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </IconFrame>
      );
    case "apps":
      return (
        <IconFrame className={c}>
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </IconFrame>
      );
    case "comercial":
      return (
        <IconFrame className={c}>
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 15v-4" />
          <path d="M12 15V8" />
          <path d="M16 15v-6" />
        </IconFrame>
      );
    case "logistica":
      return (
        <IconFrame className={c}>
          <path d="M3 7h11v10H3z" />
          <path d="M14 10h4l3 3v4h-7" />
          <circle cx="7" cy="17" r="1.5" />
          <circle cx="17" cy="17" r="1.5" />
        </IconFrame>
      );
    case "parqueadero":
      return (
        <IconFrame className={c}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 8h4a3 3 0 0 1 0 6H8z" />
          <path d="M8 8v8" />
        </IconFrame>
      );
    case "tramites":
      return (
        <IconFrame className={c}>
          <path d="M8 3h6l4 4v14H8z" />
          <path d="M14 3v4h4" />
          <path d="M10 12h6" />
          <path d="M10 16h6" />
        </IconFrame>
      );
    case "taller":
      return (
        <IconFrame className={c}>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5z" />
        </IconFrame>
      );
    case "compras":
      return (
        <IconFrame className={c}>
          <path d="M6 7h15l-1.5 9H8L6 7z" />
          <path d="M6 7 5 4H2" />
          <circle cx="9" cy="20" r="1.2" />
          <circle cx="18" cy="20" r="1.2" />
        </IconFrame>
      );
    case "tesoreria":
      return (
        <IconFrame className={c}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7v10" />
          <path d="M9.5 9.5c.6-1 1.6-1.5 2.5-1.5 1.4 0 2.5.8 2.5 2s-1.1 2-2.5 2h-1c-1.4 0-2.5.8-2.5 2s1.1 2 2.5 2c.9 0 1.9-.5 2.5-1.5" />
        </IconFrame>
      );
    case "contabilidad":
      return (
        <IconFrame className={c}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </IconFrame>
      );
    case "revisoria_fiscal":
      return (
        <IconFrame className={c}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
          <path d="M9 11h4" />
          <path d="M11 9v4" />
        </IconFrame>
      );
    case "rrhh":
      return (
        <IconFrame className={c}>
          <circle cx="9" cy="8" r="3" />
          <circle cx="17" cy="9" r="2.2" />
          <path d="M3 19c0-3 2.5-5 6-5s6 2 6 5" />
          <path d="M15 19c0-2 1.5-3.5 4-3.5.7 0 1.4.1 2 .4" />
        </IconFrame>
      );
    case "call_center":
      return (
        <IconFrame className={c}>
          <path d="M4 5h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
          <path d="M18 9h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1v2l-3-2" />
        </IconFrame>
      );
    case "qhse":
      return (
        <IconFrame className={c}>
          <path d="M12 3 4 7v5c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V7z" />
          <path d="M9 12l2 2 4-4" />
        </IconFrame>
      );
    case "juridico":
      return (
        <IconFrame className={c}>
          <path d="M12 3v18" />
          <path d="M5 7h14" />
          <path d="M7 7l-2 8h6" />
          <path d="M17 7l2 8h-6" />
          <path d="M8 21h8" />
        </IconFrame>
      );
    case "sarlaft":
      return (
        <IconFrame className={c}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </IconFrame>
      );
    case "archivo":
      return (
        <IconFrame className={c}>
          <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2" />
        </IconFrame>
      );
    case "tecnologia_ti":
      return (
        <IconFrame className={c}>
          <rect x="3" y="4" width="18" height="12" rx="2" />
          <path d="M8 20h8" />
          <path d="M12 16v4" />
        </IconFrame>
      );
    case "usuarios":
      return (
        <IconFrame className={c}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 19c0-3.2 3-5.5 7-5.5s7 2.3 7 5.5" />
        </IconFrame>
      );
    case "cuenta":
      return (
        <IconFrame className={c}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="10" r="3" />
          <path d="M6.5 18.2c1.4-2 3.3-3 5.5-3s4.1 1 5.5 3" />
        </IconFrame>
      );
    case "search":
      return (
        <IconFrame className={c}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-3.5-3.5" />
        </IconFrame>
      );
    case "collapse":
      return (
        <IconFrame className={c}>
          <path d="M15 6l-6 6 6 6" />
        </IconFrame>
      );
    case "menu":
      return (
        <IconFrame className={c}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </IconFrame>
      );
    case "close":
      return (
        <IconFrame className={c}>
          <path d="M6 6l12 12" />
          <path d="M18 6 6 18" />
        </IconFrame>
      );
    default:
      return (
        <IconFrame className={c}>
          <circle cx="12" cy="12" r="8" />
        </IconFrame>
      );
  }
}
