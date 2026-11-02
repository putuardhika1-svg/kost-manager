import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ["bcryptjs"],
  experimental: {
    serverActions: {
      // bukti bayar maks. 5 MB + overhead form
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
