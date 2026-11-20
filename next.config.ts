import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  // Lets `next dev` use its own folder (NEXT_DIST_DIR=.next-dev) so a concurrent `next build` can't corrupt it.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  webpack(config) {
    // Keep local builds within the workspace's disk budget.
    config.cache = false;
    // Privy's optional fiat onramp imports Stripe, which this Fuji-only app does not use.
    config.resolve ??= {};
    config.resolve.alias = { ...config.resolve.alias, "@stripe/stripe-js": false };
    return config;
  },
};
export default nextConfig;
