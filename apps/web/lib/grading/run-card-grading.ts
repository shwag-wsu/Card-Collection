import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  AnalyzerResponse,
  CardMetadata,
  GradingStatus,
  runAiPregradePipeline
} from "./ai-pregrade";

type AnalyzerPayload = {
  collection_item_id: string;
  front_image_path?: string;
  back_image_path?: string;
};

export type RunCardGradingInput = {
  collectionItemId: string;
  metadata: CardMetadata;
  frontImagePath?: string;
  backImagePath?: string;
};

export type NormalizedCardGradingResult = {
  aiPreGradeEstimate: {
    gradable: boolean;
    predictedGrade: number | null;
    aiPreGradeEstimate: string;
    estimatedGradeRange: string;
    confidence: string;
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
  } | null;
  gradeEstimateId: string | null;
  gradingStatus: GradingStatus;
  gradingError: string | null;
  requestId: string;
  fallbackUsed: boolean;
  openAiUsed: boolean;
};

const ANALYZER_URL = process.env.ANALYZER_URL;

async function requestCardImageAnalysis(payload: AnalyzerPayload): Promise<AnalyzerResponse | null> {
  if (!ANALYZER_URL) return null;

  try {
    const response = await fetch(`${ANALYZER_URL}/analyze/card-images`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });

    if (!response.ok) return null;
    return (await response.json()) as AnalyzerResponse;
  } catch {
    return null;
  }
}

function parseEstimateRange(range: string) {
  if (!range || range === "N/A") {
    return { low: null as number | null, high: null as number | null };
  }

  const [low, high] = range.split(" - ").map((value) => Number(value));
  return {
    low: Number.isFinite(low) ? low : null,
    high: Number.isFinite(high) ? high : null
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function runCardGrading(input: RunCardGradingInput): Promise<NormalizedCardGradingResult> {
  const requestId = randomUUID();

  const analyzer = await requestCardImageAnalysis({
    collection_item_id: input.collectionItemId,
    front_image_path: input.frontImagePath,
    back_image_path: input.backImagePath
  });

  const pregrade = await runAiPregradePipeline({
    requestId,
    metadata: input.metadata,
    frontImagePath: input.frontImagePath,
    backImagePath: input.backImagePath,
    analyzer
  });

  await prisma.gradingRun.create({
    data: {
      collection_item_id: input.collectionItemId,
      request_id: requestId,
      provider: pregrade.telemetry.provider,
      model: pregrade.telemetry.model,
      status: pregrade.telemetry.status,
      fallback_used: pregrade.telemetry.fallbackUsed,
      error_message: pregrade.telemetry.errorMessage,
      latency_ms: pregrade.telemetry.latencyMs
    }
  });

  if (!pregrade.ok) {
    return {
      aiPreGradeEstimate: null,
      gradeEstimateId: null,
      gradingStatus: "failed",
      gradingError: pregrade.error,
      requestId,
      fallbackUsed: pregrade.telemetry.fallbackUsed,
      openAiUsed: false
    };
  }

  const estimate = pregrade.estimate;
  const range = parseEstimateRange(estimate.estimatedGradeRange);

  const gradeEstimate = await prisma.gradeEstimate.create({
    data: {
      collection_item_id: input.collectionItemId,
      analyzer_version: pregrade.analyzer.analyzer_version ?? "ai-pregrade-v2",
      image_quality_score: pregrade.analyzer.image_quality_score,
      blur_flag: pregrade.analyzer.blur_flag ?? estimate.detectedIssues.includes("blur"),
      glare_flag: pregrade.analyzer.glare_flag ?? estimate.detectedIssues.includes("glare"),
      skew_flag: pregrade.analyzer.skew_flag ?? estimate.detectedIssues.includes("skew"),
      centering_score: estimate.subscores.centering,
      corners_score: estimate.subscores.corners,
      edges_score: estimate.subscores.edges,
      surface_score: estimate.subscores.surface,
      predicted_grade_low: range.low,
      predicted_grade_high: range.high,
      confidence: estimate.confidence,
      summary: estimate.rationale,
      grading_status: estimate.gradingStatus,
      gradable: estimate.gradable,
      predicted_grade: estimate.predictedGrade,
      detected_issues: toJsonValue(estimate.detectedIssues),
      limitations: toJsonValue(estimate.limitations),
      retake_guidance: toJsonValue(estimate.retakeGuidance),
      raw_ai_response: toJsonValue(estimate.rawAiResponse ?? estimate)
    }
  });

  return {
    aiPreGradeEstimate: {
      gradable: estimate.gradable,
      predictedGrade: estimate.predictedGrade,
      aiPreGradeEstimate: estimate.aiPreGradeEstimate,
      estimatedGradeRange: estimate.estimatedGradeRange,
      confidence: `${Math.round(estimate.confidence * 100)}%`,
      detectedIssues: estimate.detectedIssues,
      limitations: estimate.limitations,
      retakeGuidance: estimate.retakeGuidance,
      rationale: estimate.rationale,
      subscores: estimate.subscores,
      fallbackUsed: estimate.fallbackUsed,
      gradingStatus: estimate.gradingStatus
    },
    gradeEstimateId: gradeEstimate.id,
    gradingStatus: estimate.gradingStatus,
    gradingError: null,
    requestId,
    fallbackUsed: pregrade.telemetry.fallbackUsed,
    openAiUsed: !pregrade.telemetry.fallbackUsed
  };
}
