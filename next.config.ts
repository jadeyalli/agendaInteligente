import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/schedule",
        destination: "/api/schedule/solve",
      },
    ];
  },
};

export default nextConfig;
