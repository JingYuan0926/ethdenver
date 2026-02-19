import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@hashgraph/sdk", "@0gfoundation/0g-ts-sdk", "@0glabs/0g-serving-broker", "ethers"],
  devIndicators: false,
};

export default nextConfig;
