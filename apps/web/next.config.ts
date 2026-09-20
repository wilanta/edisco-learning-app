import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

const nextConfig: NextConfig = {
  // Keep Turbopack's watcher inside this repository. Using `/` here makes the
  // dev server observe unrelated WSL filesystem changes and continuously HMR.
  turbopack: {
    root: monorepoRoot,
  },
};

export default nextConfig;
