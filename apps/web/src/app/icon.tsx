import { ImageResponse } from "next/og";
import { darkTokens } from "@/lib/design-tokens";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon generado — evita 404 /favicon.ico en el despliegue */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: darkTokens.canvas,
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: `3px solid ${darkTokens.primary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 999,
              background: darkTokens.primary,
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
