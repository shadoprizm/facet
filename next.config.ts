import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: a stray lockfile in $HOME confuses inference.
    root: __dirname,
  },
};

export default nextConfig;
