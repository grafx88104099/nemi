import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Зарын зургийн эх сурвалжууд (seed: unsplash, агент upload: Supabase storage)
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default nextConfig;
