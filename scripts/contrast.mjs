/**
 * Check every colour token against WCAG AA, in both themes.
 *
 *     pnpm design:contrast
 *
 * This exists because the same bug has happened repeatedly: a colour picked for
 * how it looks as a large fill, then used as a small mark or as type, where it
 * measures far below the threshold. A medium-confidence dot once came in at
 * 1.81:1 — visible on the designer's screen, invisible on a phone in daylight.
 *
 * The palette has since changed completely, from Bauhaus primaries to the
 * per-metric hues do.fit uses. The check survived the redesign unchanged in
 * spirit: every hue still exists twice, once vivid enough to read as a ring and
 * once dark enough to read as a number.
 *
 * Text needs 4.5:1 and a meaningful graphic needs 3:1 — both from WCAG. Which
 * one applies is a property of how the token is *used*, so it is declared here
 * per token rather than inferred.
 *
 * The 1.5 on the hairlines is a house rule, not a WCAG number: those rules are
 * decorative separators, so no threshold is required of them, but below about
 * 1.5 they stop reading as a line at all on a phone.
 */
import { converter, parse, wcagContrast } from "culori";
import fs from "node:fs";
import path from "node:path";

const CSS = path.join(import.meta.dirname, "..", "src", "app", "globals.css");

/** token -> the minimum ratio its usage demands. */
const REQUIRED = {
  "--foreground": 4.5,
  "--muted-foreground": 4.5,
  // The per-metric hues, as *type* — a figure or a label.
  "--ink-energy": 4.5,
  "--ink-protein": 4.5,
  "--ink-water": 4.5,
  "--ink-weight": 4.5,
  // The same hues as *graphics* — a ring, a fill, a dot. WCAG asks 3:1.
  "--accent-energy": 3,
  "--accent-protein": 3,
  "--accent-water": 3,
  "--accent-weight": 3,
  "--rule": 1.5,
  "--border": 1.5,
  "--input": 1.5,
};

const rgb = converter("rgb");
const css = fs.readFileSync(CSS, "utf8");

/**
 * Read the *last* declaration of each token inside a block, which is what the
 * cascade resolves to. Only the final `:root` / `.dark` pair matters — the
 * shadcn defaults earlier in the file are overridden wholesale.
 */
function tokensIn(selector) {
  const blocks = [...css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))];
  const found = {};
  for (const [, body] of blocks) {
    for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
      found[name] = value.trim();
    }
  }
  return found;
}

/** Tokens can point at other tokens (`var(--foreground)`); follow the chain. */
function resolve(tokens, value, depth = 0) {
  const ref = /^var\((--[\w-]+)\)$/.exec(value);
  if (!ref || depth > 8) return value;
  return resolve(tokens, tokens[ref[1]] ?? value, depth + 1);
}

let failures = 0;
for (const [theme, selector] of [["light", ":root"], ["dark", "\\.dark"]]) {
  const tokens = tokensIn(selector);
  const background = rgb(parse(resolve(tokens, tokens["--background"])));
  console.log(`\n${theme}`);

  for (const [token, need] of Object.entries(REQUIRED)) {
    const raw = tokens[token];
    if (!raw) continue;
    const colour = rgb(parse(resolve(tokens, raw)));
    const ratio = wcagContrast(colour, background);
    const ok = ratio >= need;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "ok  " : "FAIL"}  ${token.padEnd(20)} ${ratio.toFixed(2).padStart(6)}:1  (needs ${need})`,
    );
  }
}

console.log(
  failures === 0
    ? "\nEvery token clears AA for the way it is used."
    : `\n${failures} token(s) below AA.`,
);
process.exit(failures === 0 ? 0 : 1);
