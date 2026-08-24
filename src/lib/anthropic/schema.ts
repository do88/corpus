import { z } from "zod";

/**
 * Convert a zod schema into the JSON Schema structured outputs will accept.
 *
 * Two things have to be reconciled. Zod emits `minimum`/`maximum` on every
 * integer — `.int()` alone adds the safe-integer bounds, before any `.min()` of
 * ours — and the API rejects the request outright:
 *
 *     output_config.format.schema: For 'integer' type, properties maximum,
 *     minimum are not supported
 *
 * So the bounds are stripped here, at the boundary, rather than by weakening
 * the schema. The zod object keeps `.int()` and `.min(0)` and still enforces
 * them when the response is parsed; the model simply isn't sent a keyword it
 * refuses. Anything that must hold is validated on our side regardless — the
 * schema constrains generation, it does not verify it.
 */
export function toStructuredOutputSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== "object") return node;

  const entries = Object.entries(node as Record<string, unknown>).filter(
    ([key]) =>
      !(
        (node as Record<string, unknown>).type === "integer" &&
        (key === "minimum" || key === "maximum")
      ),
  );
  return Object.fromEntries(entries.map(([key, value]) => [key, strip(value)]));
}
