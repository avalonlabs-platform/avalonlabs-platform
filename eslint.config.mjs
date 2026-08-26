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
    // github-action/ is a standalone, plain-CommonJS Node.js project (the
    // "Agent Code Merge Gate" GitHub Action runner) meant to be extracted
    // into its own repo — see github-action/agent-code-merge-gate/README.md.
    // It deliberately uses require()/module.exports (the pinned dependency
    // majors need it — see that README's "Dependency pin note") and isn't
    // part of this app's tsconfig project, so eslint-config-next/typescript's
    // typed rules (e.g. @typescript-eslint/no-require-imports) don't apply
    // to it and shouldn't be asked to. Confirmed by reproducing the failure
    // locally: `npx eslint .` on this folder without this ignore throws
    // three `no-require-imports` errors on index.js's require() calls —
    // that's what broke CI (avalonlabs-platform CI #12-#14) once this
    // folder was first committed.
    "github-action/**",
    // avalon-video/ is a separate Remotion video-rendering project — its own
    // package.json, tsconfig.json, and (already) its own eslint.config.mjs
    // (`@remotion/eslint-config-flat`), meant to be linted with its own
    // tooling, not this app's. tsconfig.json already excludes it from this
    // project's TS compilation for the same reason. It was never added here
    // too, which is the actual gap this ignore closes — not a new boundary,
    // just finishing one already started. Confirmed by reproducing locally:
    // `npx eslint .` without this ignore throws a real
    // @typescript-eslint/no-empty-object-type error on
    // avalon-video/src/Composition.tsx's `type Props = {}` (Remotion's own
    // scaffold default, present since before this project's CI existed) —
    // a second, independent cause of the same CI failures as github-action/
    // above, not something introduced today.
    "avalon-video/**",
  ]),
]);

export default eslintConfig;
