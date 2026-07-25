import type { MetadataRoute } from "next";

const SITE = "https://f1telemetries.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/telemetry`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE}/live`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE}/compare`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];
}
