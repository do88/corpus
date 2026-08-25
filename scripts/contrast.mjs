/**
 * Check every colour token against WCAG AA, in both themes.
 *
 *     pnpm design:contrast
 *
 * This exists because the same bug has now happened twice: a colour picked for
 * how it looks as a poster primary, then used as a small mark or as type, where
 * it measures far below the threshold. The medium-confidence dot was 1.81:1 on
 * paper — visible on the designer's screen, invisible on a phone in daylight.
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
  "--bauhaus-red": 4.5,
  "--bauhaus-blue": 4.5,
  "--bauhaus-yellow": 4.5,
  "--mark-red": 3,
  "--mark-blue": 3,
  "--mark-yellow": 3,
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
