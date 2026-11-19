import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] },
  webpack(config) {
    // Noir's generated WASM wrapper embeds its module as a data: URL. Let the
    // browser's URL constructor handle it instead of Next's asset URL plugin.
    config.module.rules.push({
      test: /@zk-email\/sdk\/dist\/index-DIm3ZCEo\.mjs$/,
      parser: { url: false },
    });
    return config;
  },
};
export default nextConfig;
