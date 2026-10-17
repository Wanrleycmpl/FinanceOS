import type { NextConfig } from "next";

// Security headers for every response. The app never runs inside another site's frame,
// never needs camera/microphone/location, and only talks to its own Supabase project.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Personal finance data: never indexed by search engines.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

// Cache Components stays off: every FinanceOS screen is per-user and read at
// request time from the Supabase session, so there is no shared static shell to cache.
const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
