import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { storeImageForCollectionItem } from "../../../../../lib/image-storage";

type AnalyzerPayload = {
  collection_item_id: string;
  front_image_path?: string;
  back_image_path?: string;
};

type AnalyzerResponse = {
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

type SafeEstimateResponse = {
  id: string;
  analyzerVersion: string;
  aiPreGradeEstimate: {
    estimatedGradeRange: {
      low: number | null;
      high: number | null;
    };
    confidenceScore: number | null;
    rationale: string | null;
    detectedIssues: string[];
  };
  disclaimer: string;
  createdAt: Date;
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

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as AnalyzerResponse;
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const collectionItem = await prisma.collectionItem.findUnique({ where: { id: params.id } });
  if (!collectionItem) {
    return NextResponse.json({ error: "Collection item not found." }, { status: 404 });
  }

  const formData = await request.formData();

  const frontFile = formData.get("front_image");
  const backFile = formData.get("back_image");

  if (!(frontFile instanceof File) && !(backFile instanceof File)) {
    return NextResponse.json({ error: "Provide front_image or back_image file." }, { status: 400 });
  }

  try {
    const updateData: {
      front_image_path?: string;
      front_thumb_path?: string;
      back_image_path?: string;
      back_thumb_path?: string;
    } = {};

    if (frontFile instanceof File && frontFile.size > 0) {
      const storedFront = await storeImageForCollectionItem(params.id, "front", frontFile);
      updateData.front_image_path = storedFront.originalPath;
      updateData.front_thumb_path = storedFront.thumbPath;
    }

    if (backFile instanceof File && backFile.size > 0) {
      const storedBack = await storeImageForCollectionItem(params.id, "back", backFile);
      updateData.back_image_path = storedBack.originalPath;
      updateData.back_thumb_path = storedBack.thumbPath;
    }

    const updatedItem = await prisma.collectionItem.update({
      where: { id: params.id },
      data: updateData,
      select: {
        id: true,
        front_image_path: true,
        front_thumb_path: true,
        back_image_path: true,
        back_thumb_path: true
      }
    });

    const analysis = await requestCardImageAnalysis({
      collection_item_id: params.id,
      front_image_path: updatedItem.front_image_path ?? undefined,
      back_image_path: updatedItem.back_image_path ?? undefined
    });

    let gradeEstimate = null;

    if (analysis) {
      gradeEstimate = await prisma.gradeEstimate.create({
        data: {
          collection_item_id: params.id,
          analyzer_version: analysis.analyzer_version ?? "ai-pregrade-v1",
          image_quality_score: analysis.image_quality_score,
          blur_flag: analysis.blur_flag ?? false,
          glare_flag: analysis.glare_flag ?? false,
          skew_flag: analysis.skew_flag ?? false,
          centering_score: analysis.centering_score,
          corners_score: analysis.corners_score,
          edges_score: analysis.edges_score,
          surface_score: analysis.surface_score,
          predicted_grade_low: analysis.predicted_grade_low,
          predicted_grade_high: analysis.predicted_grade_high,
          confidence: analysis.confidence,
          summary: analysis.summary
        },
        select: {
          id: true,
          analyzer_version: true,
          predicted_grade_low: true,
          predicted_grade_high: true,
          confidence: true,
          blur_flag: true,
          glare_flag: true,
          skew_flag: true,
          summary: true,
          created_at: true
        }
      });
    }

    const safeAnalysis: SafeEstimateResponse | null = gradeEstimate
      ? {
          id: gradeEstimate.id,
          analyzerVersion: gradeEstimate.analyzer_version,
          aiPreGradeEstimate: {
            estimatedGradeRange: {
              low: gradeEstimate.predicted_grade_low ? Number(gradeEstimate.predicted_grade_low) : null,
              high: gradeEstimate.predicted_grade_high ? Number(gradeEstimate.predicted_grade_high) : null
            },
            confidenceScore: gradeEstimate.confidence ? Number(gradeEstimate.confidence) : null,
            rationale: gradeEstimate.summary ?? null,
            detectedIssues: [
              gradeEstimate.blur_flag ? "blur" : null,
              gradeEstimate.glare_flag ? "glare" : null,
              gradeEstimate.skew_flag ? "skew" : null
            ].filter(Boolean) as string[]
          },
          disclaimer:
            "This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade.",
          createdAt: gradeEstimate.created_at
        }
      : null;

    return NextResponse.json({
      item: updatedItem,
      analysis: gradeEstimate,
      aiPreGradeEstimate: safeAnalysis
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload images." },
      { status: 400 }
    );
  }
}
