import { promises as fs } from "node:fs";
import path from "node:path";

type CardMetadata = {
  year?: number;
  brand?: string;
  set?: string;
  player?: string;
  cardNumber?: string;
  variant?: string;
  sport?: string;
};

export type AnalyzerResponse = {
  analyzer_version?: string;
  image_quality_score?: number;
  blur_flag?: boolean;
  glare_flag?: boolean;
  skew_flag?: boolean;
  centering_score?: number;
  corners_score?: number;
  edges_score?: number;
  surface_score?: number;
  predicted_grade_low?: number;
  predicted_grade_high?: number;
  confidence?: number;
  summary?: string;
};

export type AiPreGradeResult = {
  aiPreGradeEstimate: string;
  estimatedGradeRange: string;
  confidence: number;
  detectedIssues: string[];
  rationale: string;
  subscores: {
    centering: number;
    corners: number;
    edges: number;
    surface: number;
  };
  fallbackUsed: boolean;
};

export type GradePipelineResult =
  | {
      ok: true;
      estimate: AiPreGradeResult;
      analyzer: AnalyzerResponse;
    }
  | {
      ok: false;
      error: string;
    };

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_GRADING_MODEL = process.env.OPENAI_GRADING_MODEL || "gpt-4.1-mini";

function clampScore(value: number, min = 1, max = 10) {
  return Math.max(min, Math.min(max, value));
}

function toGradeRangeFromSubscores(subscores: AiPreGradeResult["subscores"]) {
  const weighted =
    subscores.centering * 0.32 +
    subscores.corners * 0.24 +
    subscores.edges * 0.2 +
    subscores.surface * 0.24;
  const spread =
    Math.max(subscores.centering, subscores.corners, subscores.edges, subscores.surface) -
    Math.min(subscores.centering, subscores.corners, subscores.edges, subscores.surface);
  const halfWidth = spread > 2 ? 0.9 : 0.6;
  const low = clampScore(Number((weighted - halfWidth).toFixed(1)));
  const high = clampScore(Number((weighted + halfWidth).toFixed(1)));
  return { low, high, range: `${low.toFixed(1)} - ${high.toFixed(1)}` };
}

function deriveConfidence(input: {
  rawModelConfidence: number;
  imageQualityScore?: number;
  subscores: AiPreGradeResult["subscores"];
  issueCount: number;
}) {
  const spread = Math.abs(Math.max(...Object.values(input.subscores)) - Math.min(...Object.values(input.subscores)));
  const qualityFactor = input.imageQualityScore ? Math.max(0.35, Math.min(1, input.imageQualityScore / 100)) : 0.55;
  const consistencyPenalty = Math.min(0.2, spread * 0.03);
  const issuePenalty = Math.min(0.18, input.issueCount * 0.03);
  const normalized = clampScore((input.rawModelConfidence * qualityFactor - consistencyPenalty - issuePenalty) * 10, 1, 9.5) / 10;
  return Number(normalized.toFixed(2));
}

function apiPathToFilesystemPath(imagePath: string): string {
  if (imagePath.startsWith("/api/images/originals/")) {
    return path.join(STORAGE_ROOT, "originals", path.basename(imagePath));
  }
  return imagePath;
}

async function imagePathToDataUrl(imagePath?: string) {
  if (!imagePath) return null;
  try {
    const fsPath = apiPathToFilesystemPath(imagePath);
    const bytes = await fs.readFile(fsPath);
    const ext = path.extname(fsPath).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function callOpenAiPregrade(payload: {
  frontImagePath?: string;
  backImagePath?: string;
  metadata: CardMetadata;
}): Promise<AiPreGradeResult | null> {
  if (!OPENAI_API_KEY) return null;

  const [frontDataUrl, backDataUrl] = await Promise.all([
    imagePathToDataUrl(payload.frontImagePath),
    imagePathToDataUrl(payload.backImagePath)
  ]);

  if (!frontDataUrl && !backDataUrl) return null;

  const prompt = `You are estimating a trading card condition from uploaded images.
Return JSON only with this exact shape:
{
  "aiPreGradeEstimate": string,
  "estimatedGradeRange": string,
  "confidence": number,
  "detectedIssues": string[],
  "rationale": string,
  "subscores": {
    "centering": number,
    "corners": number,
    "edges": number,
    "surface": number
  }
}
Rules:
- This is an AI pre-grade estimate only, not an official PSA grade.
- Use PSA-like 1-10 semantics for subscores.
- Analyze only visible issues from the images.
- Keep detectedIssues specific and short.
- confidence must be between 0 and 1.
- Include card metadata context when relevant.
Card metadata:
${JSON.stringify(payload.metadata)}`;

  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  if (frontDataUrl) content.push({ type: "input_image", image_url: frontDataUrl });
  if (backDataUrl) content.push({ type: "input_image", image_url: backDataUrl });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_GRADING_MODEL,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } }
    }),
    cache: "no-store"
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    output_text?: string;
  };

  if (!data.output_text) return null;
  const parsed = JSON.parse(data.output_text) as AiPreGradeResult;

  if (!parsed?.subscores) return null;

  const subscores = {
    centering: clampScore(Number(parsed.subscores.centering || 0)),
    corners: clampScore(Number(parsed.subscores.corners || 0)),
    edges: clampScore(Number(parsed.subscores.edges || 0)),
    surface: clampScore(Number(parsed.subscores.surface || 0))
  };
  const gradeRange = toGradeRangeFromSubscores(subscores);

  return {
    aiPreGradeEstimate: parsed.aiPreGradeEstimate || gradeRange.range,
    estimatedGradeRange: gradeRange.range,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.4))),
    detectedIssues: Array.isArray(parsed.detectedIssues) ? parsed.detectedIssues.slice(0, 8) : [],
    rationale: parsed.rationale || "AI visual analysis based on uploaded front/back images.",
    subscores,
    fallbackUsed: false
  };
}

export function buildFallbackEstimate(analyzer: AnalyzerResponse): AiPreGradeResult {
  const subscores = {
    centering: clampScore(Number(analyzer.centering_score ?? 3)),
    corners: clampScore(Number(analyzer.corners_score ?? 3)),
    edges: clampScore(Number(analyzer.edges_score ?? 3)),
    surface: clampScore(Number(analyzer.surface_score ?? 3))
  };
  const gradeRange = toGradeRangeFromSubscores(subscores);
  const detectedIssues = [analyzer.blur_flag ? "blur" : null, analyzer.glare_flag ? "glare" : null, analyzer.skew_flag ? "skew" : null].filter(
    Boolean
  ) as string[];

  return {
    aiPreGradeEstimate: gradeRange.range,
    estimatedGradeRange: gradeRange.range,
    confidence: deriveConfidence({
      rawModelConfidence: Number(analyzer.confidence ?? 0.25),
      imageQualityScore: analyzer.image_quality_score,
      subscores,
      issueCount: detectedIssues.length
    }),
    detectedIssues,
    rationale:
      analyzer.summary ||
      "Fallback estimate derived from analyzer image-quality and defect signals because direct AI grading was unavailable.",
    subscores,
    fallbackUsed: true
  };
}

export async function runAiPregradePipeline(input: {
  metadata: CardMetadata;
  frontImagePath?: string;
  backImagePath?: string;
  analyzer: AnalyzerResponse | null;
}): Promise<GradePipelineResult> {
  try {
    const llm = await callOpenAiPregrade({
      frontImagePath: input.frontImagePath,
      backImagePath: input.backImagePath,
      metadata: input.metadata
    });

    if (llm) {
      const withDerivedConfidence = {
        ...llm,
        confidence: deriveConfidence({
          rawModelConfidence: llm.confidence,
          imageQualityScore: input.analyzer?.image_quality_score,
          subscores: llm.subscores,
          issueCount: llm.detectedIssues.length
        })
      };

      return { ok: true, estimate: withDerivedConfidence, analyzer: input.analyzer ?? {} };
    }

    if (input.analyzer) {
      return { ok: true, estimate: buildFallbackEstimate(input.analyzer), analyzer: input.analyzer };
    }

    return { ok: false, error: "AI pre-grade service unavailable. Please retry after confirming analyzer/AI configuration." };
  } catch {
    if (input.analyzer) {
      return { ok: true, estimate: buildFallbackEstimate(input.analyzer), analyzer: input.analyzer };
    }

    return { ok: false, error: "AI pre-grade request failed before an estimate could be generated." };
  }
}
