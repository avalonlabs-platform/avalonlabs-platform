import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root — otherwise Turbopack may pick up an unrelated
  // lockfile from a parent directory (e.g. the user's home folder) and
  // resolve modules against the wrong node_modules.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
