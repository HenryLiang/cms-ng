import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // workspace 包:@cms-ng/shared 需显式声明,否则 next/turbopack 在 CI(npm ci)下无法解析
  transpilePackages: ['@cms-ng/shared'],
};

export default nextConfig;
