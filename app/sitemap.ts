import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_DOMAIN ? `https://${process.env.NEXT_PUBLIC_APP_DOMAIN}` : "http://localhost:3000";
  const routes = ["", "/privacy", "/about", "/features", "/pricing", "/contact", "/auth"];
  return routes.map((r) => ({ url: `${base}${r}`, changeFrequency: "daily", priority: r ? 0.7 : 1 }));
}
