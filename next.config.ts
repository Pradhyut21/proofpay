import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  webpack(config, { webpack }) {
    // Only native Next.js runs this hook. The Vinext Worker keeps real bindings.
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(process.cwd(), "lib/proofpay/runtime-vercel.ts"),
    ));
    return config;
  },
};

export default nextConfig;
