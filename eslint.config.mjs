import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // mobile/ is a separate Expo/React Native app with its own lint needs —
    // eslint-config-next's web-focused react-hooks rules produce false
    // positives there (e.g. flagging the standard `useRef(...).current`
    // Animated-value pattern as "cannot access refs during render", which
    // is specific to React DOM rendering semantics, not React Native's).
    // tsconfig.json already excludes "mobile" from this project's TS
    // compilation for the same reason — this brings eslint in line with
    // that existing boundary rather than establishing a new one.
    "mobile/**",
  ]),
]);

export default eslintConfig;
