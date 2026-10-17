import type { NextConfig } from "next";

// Cache Components stays off: every FinanceOS screen is per-user and read at
// request time from the Supabase session, so there is no shared static shell to cache.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
