"use client";

import { useId } from "react";

type NexaLogoProps = {
  variant?: "icon" | "full";
  className?: string;
  title?: string;
};

/** Marca isométrica NEXA OS — responde al tema vía tokens `--brand-*`. */
export function NexaLogo({
  variant = "icon",
  className = "",
  title = "NEXA OS",
}: NexaLogoProps) {
  const gradId = useId().replace(/:/g, "");
  const glowId = useId().replace(/:/g, "");

  if (variant === "full") {
    return (
      <svg
        viewBox="0 0 220 48"
        className={className}
        role="img"
        aria-label={title}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>{title}</title>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="1" />
            <stop
              offset="100%"
              stopColor="var(--brand-secondary)"
              stopOpacity="0.85"
            />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="0"
              stdDeviation="2"
              floodColor="var(--brand-primary)"
              floodOpacity="0.45"
            />
          </filter>
        </defs>
        <g filter={`url(#${glowId})`}>
          <path
            d="M4 38 L4 10 L20 26 L36 10 L36 38"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="3"
            strokeLinecap="square"
            strokeLinejoin="miter"
          />
          <path
            d="M8 38 L8 18 L20 30 L32 18 L32 38"
            fill="none"
            stroke="var(--brand-primary)"
            strokeOpacity="0.35"
            strokeWidth="1.2"
          />
          <rect
            x="2"
            y="6"
            width="36"
            height="36"
            rx="4"
            fill="color-mix(in srgb, var(--brand-primary) 12%, transparent)"
            stroke={`url(#${gradId})`}
            strokeWidth="0.75"
            strokeOpacity="0.5"
          />
        </g>
        <text
          x="48"
          y="22"
          fill="var(--brand-text-primary)"
          fontFamily="var(--font-mono), JetBrains Mono, monospace"
          fontSize="18"
          fontWeight="700"
          letterSpacing="0.18em"
        >
          NEXA
        </text>
        <text
          x="48"
          y="38"
          fill="var(--brand-primary)"
          fontFamily="var(--font-mono), JetBrains Mono, monospace"
          fontSize="10"
          fontWeight="600"
          letterSpacing="0.28em"
        >
          ENTERPRISE OS
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--brand-primary)" />
          <stop offset="55%" stopColor="var(--brand-secondary)" />
          <stop
            offset="100%"
            stopColor="var(--brand-primary)"
            stopOpacity="0.7"
          />
        </linearGradient>
        <filter id={glowId}>
          <feDropShadow
            dx="0"
            dy="0"
            stdDeviation="1.5"
            floodColor="var(--brand-primary)"
            floodOpacity="0.5"
          />
        </filter>
      </defs>
      <g filter={`url(#${glowId})`}>
        <rect
          x="2"
          y="2"
          width="36"
          height="36"
          rx="5"
          fill="color-mix(in srgb, var(--brand-surface) 70%, transparent)"
          stroke={`url(#${gradId})`}
          strokeWidth="1"
        />
        <path
          d="M10 30 L10 12 L20 22 L30 12 L30 30"
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="2.4"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className="brand-mark-path"
        />
        <path
          d="M6 34 L34 34"
          stroke="var(--brand-primary)"
          strokeOpacity="0.25"
          strokeWidth="0.8"
        />
      </g>
    </svg>
  );
}

/** Alias compacto para sidebar / favicon inline. */
export function NexaLogoIcon(props: Omit<NexaLogoProps, "variant">) {
  return <NexaLogo {...props} variant="icon" />;
}
