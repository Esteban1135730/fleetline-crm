/**
 * NEXA Enterprise Fleet & Logistics — brand metadata + theme bridge
 */
import {
  darkTokens,
  lightTokens,
  tokensForMode,
  tokensToCssVars,
  type DesignTokens,
  type ThemeMode,
} from "./design-tokens";

export const brand = {
  name: "NEXA",
  shortName: "NXA",
  tagline: "NEXA Enterprise Fleet & Logistics OS",
  product: "CRM y telemetría",
  engine: "MOTOR DE TELEMETRÍA V2.4",
} as const;

export type ThemeTokens = DesignTokens;
export { type ThemeMode, darkTokens, lightTokens, tokensForMode, tokensToCssVars };

/** @deprecated Use tokensForMode(mode) */
export const darkTheme = darkTokens;
/** @deprecated Use tokensForMode(mode) */
export const lightTheme = lightTokens;

export function themeToCssVars(mode: ThemeMode): Record<string, string> {
  return tokensToCssVars(tokensForMode(mode));
}

export function brandCssVars() {
  return tokensToCssVars(darkTokens);
}
