import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fsg/ui", "@fsg/shared"],
  reactStrictMode: true,
  output: "standalone",
  async redirects() {
    return [
      { source: "/finanzas", destination: "/tesoreria", permanent: false },
      {
        source: "/revisoria",
        destination: "/revisoria-fiscal",
        permanent: false,
      },
      { source: "/calidad", destination: "/qhse", permanent: false },
      {
        source: "/sistemas",
        destination: "/tecnologia-ti",
        permanent: false,
      },
      { source: "/atencion", destination: "/call-center", permanent: false },
      { source: "/recepcion", destination: "/call-center", permanent: false },
    ];
  },
};

export default nextConfig;
