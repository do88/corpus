/**
 * Gemini structured output uses an OpenAPI subset rather than full JSON
 * Schema. Keep this shared by the app and benchmark so the measured contract
 * is exactly the one production sends.
 */
export const GEMINI_MEAL_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          qty: { type: "string" },
          kcal: { type: "integer" },
          protein_g: { type: "integer" },
          carbs_g: { type: "integer" },
          fat_g: { type: "integer" },
        },
        required: ["name", "qty", "kcal", "protein_g", "carbs_g", "fat_g"],
      },
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    assumptions: { type: "string" },
  },
  required: ["items", "confidence", "assumptions"],
};
