import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow image uploads through server actions: sign-up sends a photo and an ID card (2 MB each).
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
