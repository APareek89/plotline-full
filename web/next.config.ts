import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Resolve the entry URL before AccountShell can reveal its RSC children.
  async redirects() {
    return [{ source: "/", destination: "/studio/campaign", permanent: false }];
  },
  ...(process.env.PLOTLINE_DIST_DIR ? { distDir: process.env.PLOTLINE_DIST_DIR } : {}),
};

export default nextConfig;
