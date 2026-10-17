import type { MetadataRoute } from "next";

// Private personal app: ask every crawler to stay out.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
