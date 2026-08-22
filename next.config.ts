import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    testProxy: true,
  },
};

export default nextConfig;
