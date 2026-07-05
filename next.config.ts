import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: a stray lockfile in $HOME confuses inference.
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Avatar uploads allow 3MB images; the default 1MB action body limit
      // rejected them before the action code ever ran. Extra 1MB covers
      // multipart boundary/header overhead.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
