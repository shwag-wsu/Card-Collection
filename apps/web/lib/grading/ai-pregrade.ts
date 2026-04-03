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
  crop_flag?: boolean;
  centering_score?: number;
  corners_score?: number;
  edges_score?: number;
  surface_score?: number;
  predicted_grade_low?: number;
  predicted_grade_high?: number;
  confidence?: number;
  summary?: string;
};

export type GradingStatus = "estimated" | "fallback_estimated" | "needs_retake" | "failed";

export type AiPreGradeResult = {
  gradable: boolean;
  predictedGrade: number | null;
  aiPreGradeEstimate: string;
  estimatedGradeRange: string;
  confidence: number;
  detectedIssues: string[];
  limitations: string[];
  retakeGuidance: string[];
  rationale: string;
  subscores: {
    centering: number;
    corners: number;
    edges: number;
    surface: number;
  };
  fallbackUsed: boolean;
  gradingStatus: GradingStatus;
};

export type GradingRunTelemetry = {
  provider: string;
  model: string;
  status: GradingStatus;
  fallbackUsed: boolean;
  errorMessage: string | null;
  latencyMs: number;
};

export type GradePipelineResult =
  | {
      ok: true;
      estimate: AiPreGradeResult;
      analyzer: AnalyzerResponse;
      telemetry: GradingRunTelemetry;
    }
  | {
      ok: false;
      error: string;
      telemetry: GradingRunTelemetry;
    };

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_GRADING_MODEL = process.env.OPENAI_GRADING_MODEL || "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 15000);
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 2);

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
  const predicted = Number(((low + high) / 2).toFixed(1));
  return { low, high, predicted, range: `${low.toFixed(1)} - ${high.toFixed(1)}` };
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
  const normalized =
    clampScore((input.rawModelConfidence * qualityFactor - consistencyPenalty - issuePenalty) * 10, 1, 9.5) / 10;
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

function withTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

type OpenAiParsedResult = Omit<AiPreGradeResult, "fallbackUsed" | "gradingStatus">;

async function callOpenAiPregrade(payload: {
  frontImagePath?: string;
  backImagePath?: string;
  metadata: CardMetadata;
  analyzer: AnalyzerResponse | null;
  requestId: string;
}): Promise<OpenAiParsedResult | null> {
  if (!OPENAI_API_KEY) return null;

  const [frontDataUrl, backDataUrl] = await Promise.all([
    imagePathToDataUrl(payload.frontImagePath),
    imagePathToDataUrl(payload.backImagePath)
  ]);

  if (!frontDataUrl && !backDataUrl) return null;

  const analyzerContext = payload.analyzer
    ? {
        image_quality_score: payload.analyzer.image_quality_score,
        blur_flag: payload.analyzer.blur_flag,
        glare_flag: payload.analyzer.glare_flag,
        skew_flag: payload.analyzer.skew_flag,
        crop_flag: payload.analyzer.crop_flag,
        predicted_grade_low: payload.analyzer.predicted_grade_low,
        predicted_grade_high: payload.analyzer.predicted_grade_high,
        confidence: payload.analyzer.confidence,
        summary: payload.analyzer.summary
      }
    : null;

  const prompt = `You are estimating a trading card condition from uploaded images.
Return JSON only with this exact shape:
{
  "gradable": boolean,
  "predictedGrade": number | null,
  "estimatedGradeRange": string,
  "confidence": number,
  "detectedIssues": string[],
  "limitations": string[],
  "retakeGuidance": string[],
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
- If image quality is insufficient, set gradable=false, predictedGrade=null, provide retakeGuidance.
- Prefer analyzer context when conflicts appear.
Card metadata:
${JSON.stringify(payload.metadata)}
Analyzer context (if provided):
${JSON.stringify(analyzerContext)}`;

  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: prompt }];
  if (frontDataUrl) content.push({ type: "input_image", image_url: frontDataUrl });
  if (backDataUrl) content.push({ type: "input_image", image_url: backDataUrl });

  let attempt = 0;
  while (attempt <= OPENAI_MAX_RETRIES) {
    attempt += 1;
    const { signal, clear } = withTimeoutSignal(OPENAI_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OPENAI_API_KEY}`,
          "x-request-id": payload.requestId
        },
        body: JSON.stringify({
          model: OPENAI_GRADING_MODEL,
          input: [{ role: "user", content }],
          text: { format: { type: "json_object" } }
        }),
        cache: "no-store",
        signal
      });
      clear();

      if (!response.ok) {
        console.warn(JSON.stringify({ level: "warn", event: "openai_pregrade_http_error", request_id: payload.requestId, attempt, status: response.status }));
        if (attempt <= OPENAI_MAX_RETRIES) continue;
        return null;
      }

      const data = (await response.json()) as { output_text?: string };
      if (!data.output_text) return null;
      const parsed = JSON.parse(data.output_text) as OpenAiParsedResult;
      if (!parsed?.subscores) return null;

      const subscores = {
        centering: clampScore(Number(parsed.subscores.centering || 0)),
        corners: clampScore(Number(parsed.subscores.corners || 0)),
        edges: clampScore(Number(parsed.subscores.edges || 0)),
        surface: clampScore(Number(parsed.subscores.surface || 0))
      };
      const gradeRange = toGradeRangeFromSubscores(subscores);
      const gradable = Boolean(parsed.gradable);

      return {
        gradable,
        predictedGrade: gradable ? Number(parsed.predictedGrade ?? gradeRange.predicted) : null,
        aiPreGradeEstimate: gradable ? gradeRange.range : "Ungradable from provided images",
        estimatedGradeRange: gradable ? gradeRange.range : "N/A",
        confidence: Math.max(0, Math.min(1, Number(parsed.confidence || 0.4))),
        detectedIssues: Array.isArray(parsed.detectedIssues) ? parsed.detectedIssues.slice(0, 8) : [],
        limitations: Array.isArray(parsed.limitations) ? parsed.limitations.slice(0, 8) : [],
        retakeGuidance: Array.isArray(parsed.retakeGuidance) ? parsed.retakeGuidance.slice(0, 8) : [],
        rationale: parsed.rationale || "AI visual analysis based on uploaded front/back images.",
        subscores
      };
    } catch (error) {
      clear();
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "openai_pregrade_exception",
          request_id: payload.requestId,
          attempt,
          error: error instanceof Error ? error.message : "Unknown"
        })
      );
      if (attempt > OPENAI_MAX_RETRIES) return null;
    }
  }

  return null;
}

export function buildFallbackEstimate(analyzer: AnalyzerResponse): AiPreGradeResult {
  const subscores = {
    centering: clampScore(Number(analyzer.centering_score ?? 3)),
    corners: clampScore(Number(analyzer.corners_score ?? 3)),
    edges: clampScore(Number(analyzer.edges_score ?? 3)),
    surface: clampScore(Number(analyzer.surface_score ?? 3))
  };
  const gradeRange = toGradeRangeFromSubscores(subscores);
  const detectedIssues = [
    analyzer.blur_flag ? "blur" : null,
    analyzer.glare_flag ? "glare" : null,
    analyzer.skew_flag ? "skew" : null,
    analyzer.crop_flag ? "framing/crop" : null
  ].filter(Boolean) as string[];

  const needsRetake = (analyzer.image_quality_score ?? 0) < 30 || detectedIssues.length >= 3;

  return {
    gradable: !needsRetake,
    predictedGrade: needsRetake ? null : gradeRange.predicted,
    aiPreGradeEstimate: needsRetake ? "Ungradable from provided images" : gradeRange.range,
    estimatedGradeRange: needsRetake ? "N/A" : gradeRange.range,
    confidence: deriveConfidence({
      rawModelConfidence: Number(analyzer.confidence ?? 0.25),
      imageQualityScore: analyzer.image_quality_score,
      subscores,
      issueCount: detectedIssues.length
    }),
    detectedIssues,
    limitations: needsRetake ? ["Image quality too low for reliable estimate."] : [],
    retakeGuidance: needsRetake
      ? [
          "Capture front and back straight-on in even lighting.",
          "Avoid glare and ensure corners are fully visible.",
          "Use higher focus and hold camera steady."
        ]
      : [],
    rationale:
      analyzer.summary ||
      "Fallback estimate derived from analyzer image-quality and defect signals because direct AI grading was unavailable.",
    subscores,
    fallbackUsed: true,
    gradingStatus: needsRetake ? "needs_retake" : "fallback_estimated"
  };
}

export async function runAiPregradePipeline(input: {
  requestId: string;
  metadata: CardMetadata;
  frontImagePath?: string;
  backImagePath?: string;
  analyzer: AnalyzerResponse | null;
}): Promise<GradePipelineResult> {
  const start = Date.now();
  const baseTelemetry = {
    provider: "openai",
    model: OPENAI_GRADING_MODEL,
    fallbackUsed: false
  };

  try {
    const llm = await callOpenAiPregrade({
      frontImagePath: input.frontImagePath,
      backImagePath: input.backImagePath,
      metadata: input.metadata,
      analyzer: input.analyzer,
      requestId: input.requestId
    });

    if (llm) {
      const withDerivedConfidence: AiPreGradeResult = {
        ...llm,
        confidence: deriveConfidence({
          rawModelConfidence: llm.confidence,
          imageQualityScore: input.analyzer?.image_quality_score,
          subscores: llm.subscores,
          issueCount: llm.detectedIssues.length
        }),
        fallbackUsed: false,
        gradingStatus: llm.gradable ? "estimated" : "needs_retake"
      };

      const latencyMs = Date.now() - start;
      console.info(
        JSON.stringify({
          level: "info",
          event: "grading_pipeline_completed",
          request_id: input.requestId,
          provider: "openai",
          model: OPENAI_GRADING_MODEL,
          status: withDerivedConfidence.gradingStatus,
          fallback_used: false,
          latency_ms: latencyMs
        })
      );

      return {
        ok: true,
        estimate: withDerivedConfidence,
        analyzer: input.analyzer ?? {},
        telemetry: {
          ...baseTelemetry,
          status: withDerivedConfidence.gradingStatus,
          errorMessage: null,
          latencyMs
        }
      };
    }

    if (input.analyzer) {
      const fallback = buildFallbackEstimate(input.analyzer);
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        estimate: fallback,
        analyzer: input.analyzer,
        telemetry: {
          ...baseTelemetry,
          status: fallback.gradingStatus,
          fallbackUsed: true,
          errorMessage: "OpenAI unavailable; used analyzer fallback",
          latencyMs
        }
      };
    }

    const latencyMs = Date.now() - start;
    return {
      ok: false,
      error: "AI pre-grade service unavailable and analyzer fallback not available.",
      telemetry: {
        ...baseTelemetry,
        status: "failed",
        fallbackUsed: false,
        errorMessage: "No OpenAI result and no analyzer fallback",
        latencyMs
      }
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    if (input.analyzer) {
      const fallback = buildFallbackEstimate(input.analyzer);
      return {
        ok: true,
        estimate: fallback,
        analyzer: input.analyzer,
        telemetry: {
          ...baseTelemetry,
          status: fallback.gradingStatus,
          fallbackUsed: true,
          errorMessage: error instanceof Error ? error.message : "Unknown grading error",
          latencyMs
        }
      };
    }

    return {
      ok: false,
      error: "AI pre-grade request failed before an estimate could be generated.",
      telemetry: {
        ...baseTelemetry,
        status: "failed",
        fallbackUsed: false,
        errorMessage: error instanceof Error ? error.message : "Unknown grading error",
        latencyMs
      }
    };
  }
}
