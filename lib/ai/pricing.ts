export type ModelPricing = {
  prompt_per_1k: number;
  completion_per_1k: number;
};

export const MODEL_PRICING_USD: Record<string, ModelPricing> = {
  // Keep model names as your "base" identifiers.
  // We normalize dated variants like "gpt-4.1-mini-2025-04-14" -> "gpt-4.1-mini".
  "gpt-4.1-mini": { prompt_per_1k: 0.0003, completion_per_1k: 0.0012 },
  "gpt-4o-mini": { prompt_per_1k: 0.00015, completion_per_1k: 0.0006 },
  "gpt-4o": { prompt_per_1k: 0.005, completion_per_1k: 0.015 },
};

function normalizeModel(model: string) {
  // Example: "gpt-4.1-mini-2025-04-14" -> "gpt-4.1-mini"
  // Only strips a trailing "-YYYY-MM-DD" if present.
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
}

export function calcCostUsd(
  model: string | undefined,
  promptTokens?: number | null,
  completionTokens?: number | null
): number | null {
  if (!model) return null;

  const normalized = normalizeModel(model);
  const pricing = MODEL_PRICING_USD[normalized];
  if (!pricing) return null;

  const pt = promptTokens ?? 0;
  const ct = completionTokens ?? 0;

  return (pt / 1000) * pricing.prompt_per_1k + (ct / 1000) * pricing.completion_per_1k;
}
