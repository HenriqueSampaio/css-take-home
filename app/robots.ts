import type { MetadataRoute } from "next";

// A take-home demo on shared, resettable data: nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
