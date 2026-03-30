export const AI_PRE_GRADE_COPY = {
  sectionTitle: "AI Pre-Grade Estimate",
  rangeLabel: "Estimated PSA-like Range",
  conditionLabel: "AI Condition Analysis",
  issuesLabel: "Detected Issues",
  confidenceLabel: "Confidence",
  helperText: "Unofficial estimate based on uploaded images",
  disclaimer:
    "This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade.",
  resultsIntro:
    "Based on the uploaded images, the AI estimates this card may fall in the following range..."
} as const;

export function formatConfidenceBadge(confidence?: number | string | null) {
  if (confidence === null || confidence === undefined) return "—";
  const normalized = typeof confidence === "string" ? Number(confidence) : confidence;
  if (Number.isNaN(normalized)) return "—";
  return `${Math.round(normalized * 100)}%`;
}
