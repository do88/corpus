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
    // `netlify dev` writes bundled edge functions here — generated, not ours.
    ".netlify/**",
  ]),
  {
    // Netlify Functions v2 are *defined* by a default-exported handler — the
    // anonymous-default rule is asking for something the platform won't accept.
    files: ["netlify/functions/**"],
    rules: { "import/no-anonymous-default-export": "off" },
  },
]);

export default eslintConfig;
