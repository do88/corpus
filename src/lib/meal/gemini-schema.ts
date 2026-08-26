import { z } from "zod";
import { mealResponseSchema } from "./schema";

/**
 * The model and our parser must share one contract. Gemini accepts the bounds,
 * descriptions and closed objects Zod emits through `responseJsonSchema`; only
 * the document-level dialect declaration is outside its supported subset.
 */
export const GEMINI_MEAL_SCHEMA = Object.fromEntries(
  Object.entries(z.toJSONSchema(mealResponseSchema)).filter(([key]) => key !== "$schema"),
);
