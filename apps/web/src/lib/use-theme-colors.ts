"use client";

import { useMemo } from "react";
import { tokensForMode } from "./design-tokens";
import { useTheme } from "./theme";

/** Chart / map / canvas consumers — always in sync with CSS variables. */
export function useThemeColors() {
  const { mode } = useTheme();
  return useMemo(() => tokensForMode(mode), [mode]);
}
