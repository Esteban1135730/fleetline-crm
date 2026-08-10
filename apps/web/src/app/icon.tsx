import { ImageResponse } from "next/og";

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
          background: "#0A0D14",
          borderRadius: 6,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: "3px solid #10B981",
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
              background: "#10B981",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
