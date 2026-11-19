import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL || "http://backend:10000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`, // Proxy to Backend
      },
    ];
  },
};

export default nextConfig;
