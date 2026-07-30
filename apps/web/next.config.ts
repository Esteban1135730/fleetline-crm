import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@fsg/ui", "@fsg/shared"],
  reactStrictMode: true,
  output: "standalone",
};

export default nextConfig;
