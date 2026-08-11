import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Docker builds use the monorepo root as their build context. Pin the
  // tracing root so standalone output always has a stable
  // `.next/standalone/frontend/server.js` entrypoint instead of embedding
  // the absolute path of whichever machine performed the build.
  outputFileTracingRoot: path.join(process.cwd(), '..'),
  // workspace 包:@cms-ng/shared 需显式声明,否则 next/turbopack 在 CI(npm ci)下无法解析
  transpilePackages: ['@cms-ng/shared'],
};

export default nextConfig;
