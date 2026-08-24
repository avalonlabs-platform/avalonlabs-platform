import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors the "@/*" -> "./src/*" path alias from tsconfig.json (Vitest
// doesn't read tsconfig paths on its own). Kept deliberately minimal —
// this repo has no test infra yet, so this config exists only to make
// `npm test` work for the unit tests under src/**/*.test.ts, not to wire
// up a full Next.js/React Testing Library environment. Adding jsdom +
// component testing is a reasonable follow-up once there's a component
// worth testing that way.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
