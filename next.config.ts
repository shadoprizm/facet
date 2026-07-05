import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root: a stray lockfile in $HOME confuses inference.
    root: __dirname,
  },
  experimental: {
    serverActions: {
      // Post images allow 5MB (avatars 3MB); the default 1MB action body limit
      // rejected them before the action code ever ran. Extra 1MB covers
      // multipart boundary/header overhead.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
