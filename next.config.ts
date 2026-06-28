import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright requires native bindings — prevent Next.js bundler from processing it
  serverExternalPackages: ['playwright'],
};

export default nextConfig;
