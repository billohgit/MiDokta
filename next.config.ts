import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow profile photo uploads (up to 2 MB) through server actions.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
