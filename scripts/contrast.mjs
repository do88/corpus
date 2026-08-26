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

/**
 * token -> the ratio its usage demands, and what it is read against.
 *
 * Two properties, both of them facts about *use* rather than about the colour,
 * which is why they are declared here instead of inferred:
 *
 *   `need` — 4.5 for type, 3 for a meaningful graphic, both from WCAG. The 1.5
 *   on hairlines is a house rule: those are decorative separators so WCAG asks
 *   nothing of them, but below about 1.5 they stop reading as a line at all.
 *
 *   `on`   — which backdrop. `card` is the opaque surface almost everything
 *   sits on; the page's ground never shows through it. `ground` is the page
 *   itself, which since the background gained its glows is no longer a single
 *   colour. Only the handful of things drawn straight onto the page are read
 *   against it: the screen heading and its caption, and the day picker, whose
 *   selected pill is a filled graphic sitting on bare ground.
 */
const REQUIRED = {
  "--foreground": { need: 4.5, on: ["card", "ground"] },
  "--muted-foreground": { need: 4.5, on: ["card", "ground"] },
  // The per-metric hues, as *type* — a figure or a label. All inside cards.
  "--ink-energy": { need: 4.5, on: ["card"] },
  "--ink-protein": { need: 4.5, on: ["card", "ground"] },
  "--ink-water": { need: 4.5, on: ["card"] },
  "--ink-weight": { need: 4.5, on: ["card"] },
  // The same hues as *graphics* — a ring, a fill, a dot. WCAG asks 3:1.
  "--accent-energy": { need: 3, on: ["card"] },
  "--accent-protein": { need: 3, on: ["card", "ground"] },
  "--accent-water": { need: 3, on: ["card"] },
  "--accent-weight": { need: 3, on: ["card"] },
  "--rule": { need: 1.5, on: ["card"] },
  "--border": { need: 1.5, on: ["card"] },
  "--input": { need: 1.5, on: ["card"] },
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

/**
 * The ground is not the `--background` token any more.
 *
 * Two radial glows are painted over it, and text sitting directly on the page
 * — the screen heading, its caption, the day-picker letters — is read against
 * whatever those glows composite to, not against the flat token. Measuring
 * against the token alone would keep printing reassuring numbers for a colour
 * no reader actually sees behind that text.
 *
 * Each layer is checked at its own peak alpha over the base. Layers are *not*
 * stacked on each other: they sit in opposite corners with a ~58% falloff, so
 * nowhere on the page carries both at strength, and compositing them together
 * would measure a colour that never gets painted.
 */
function groundLayers(tokens) {
  const raw = tokens["--ground"];
  if (!raw) return [];
  return [...raw.matchAll(/radial-gradient\([^,]*,\s*(oklch\([^)]*\))/g)].map((m) =>
    rgb(parse(m[1])),
  );
}

/** Source-over compositing, straight alpha, in sRGB. */
function over(fg, bg) {
  const a = fg.alpha ?? 1;
  return {
    mode: "rgb",
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

let failures = 0;
for (const [theme, selector] of [["light", ":root"], ["dark", "\\.dark"]]) {
  const tokens = tokensIn(selector);
  const base = rgb(parse(resolve(tokens, tokens["--background"])));

  // Every backdrop a token might be read against. The ground is the flat base
  // plus the worst point of each glow; the card is opaque, so it is one colour.
  const BACKDROPS = {
    card: [{ name: "card", colour: rgb(parse(resolve(tokens, tokens["--card"]))) }],
    ground: [
      { name: "ground", colour: base },
      ...groundLayers(tokens).map((layer, i) => ({
        name: `glow ${i + 1}`,
        colour: over(layer, base),
      })),
    ],
  };
  console.log(`\n${theme}`);

  for (const [token, { need, on }] of Object.entries(REQUIRED)) {
    const raw = tokens[token];
    if (!raw) continue;
    const colour = rgb(parse(resolve(tokens, raw)));

    // The worst backdrop it is actually used against is the one that decides.
    let worst = { ratio: Infinity, name: "" };
    for (const surface of on) {
      for (const backdrop of BACKDROPS[surface]) {
        const ratio = wcagContrast(colour, backdrop.colour);
        if (ratio < worst.ratio) worst = { ratio, name: backdrop.name };
      }
    }

    const ok = worst.ratio >= need;
    if (!ok) failures += 1;
    console.log(
      `  ${ok ? "ok  " : "FAIL"}  ${token.padEnd(20)} ${worst.ratio.toFixed(2).padStart(6)}:1  (needs ${need}, worst on ${worst.name})`,
    );
  }
}

console.log(
  failures === 0
    ? "\nEvery token clears AA for the way it is used."
    : `\n${failures} token(s) below AA.`,
);
process.exit(failures === 0 ? 0 : 1);
