import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Teach the test runner the same `@/` alias the app uses.
 *
 * There was no config here at all, which worked by accident: type-only `@/`
 * imports are erased before the runner sees them, so the alias was never
 * needed until a tested module imported a *value* through one. At that point
 * the failure is "Cannot find package '@/lib/time'", which reads like a
 * missing dependency rather than a missing alias, and the tempting fix is to
 * duplicate whatever was being imported.
 *
 * That is the real cost. `rollover.ts` wants `weekOf` — the single definition
 * of which day a week starts on — and copying it to satisfy the runner would
 * have put a second Monday in the codebase for the tests to disagree with.
 *
 * One line of config, matching `paths` in tsconfig.json.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
