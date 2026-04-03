import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { storeImageForCollectionItem, validateImageFile } from "../../../../lib/image-storage";
import { AnalyzerResponse, runAiPregradePipeline } from "../../../../lib/grading/ai-pregrade";

type AnalyzerPayload = {
  collection_item_id: string;
  front_image_path?: string;
  back_image_path?: string;
};

const ANALYZER_URL = process.env.ANALYZER_URL;
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const EXTRA_DIR = path.join(STORAGE_ROOT, "originals");

const toNumber = (value: FormDataEntryValue | null) => {
  const parsed = Number(value?.toString());
  return Number.isNaN(parsed) ? undefined : parsed;
};

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

async function storeExtraImages(collectionItemId: string, files: File[]) {
  await fs.mkdir(EXTRA_DIR, { recursive: true });

  const stored = await Promise.all(
    files.map(async (file, index) => {
      validateImageFile(file);
      const ext = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
      const filename = `${collectionItemId}-extra-${index + 1}${ext}`;
      const filePath = path.join(EXTRA_DIR, filename);
      await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
      return `/api/images/originals/${filename}`;
    })
  );

  return stored;
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

export async function POST(request: Request) {
  const requestId = randomUUID();
  const formData = await request.formData();

  const frontImage = formData.get("front_image");
  const backImage = formData.get("back_image");

  if (!(frontImage instanceof File) || frontImage.size === 0 || !(backImage instanceof File) || backImage.size === 0) {
    return NextResponse.json({ error: "Front and back images are required." }, { status: 400 });
  }

  try {
    const card = await prisma.card.create({
      data: {
        game: "Sports",
        sport: formData.get("sport")?.toString() || "Unknown",
        year: toNumber(formData.get("year")),
        manufacturer: formData.get("brand")?.toString().trim() || undefined,
        set_name: formData.get("set")?.toString().trim() || "Unknown Set",
        card_number: formData.get("cardNumber")?.toString().trim() || undefined,
        player_name: formData.get("player")?.toString().trim() || undefined,
        notes: formData.get("notes")?.toString().trim() || undefined,
        parallel: formData.get("variant")?.toString().trim() || undefined,
        variation: formData.get("team")?.toString().trim() || undefined
      }
    });

    const item = await prisma.collectionItem.create({
      data: {
        card_id: card.id,
        quantity: 1,
        ownership_status: "owned"
      }
    });

    const [storedFront, storedBack] = await Promise.all([
      storeImageForCollectionItem(item.id, "front", frontImage),
      storeImageForCollectionItem(item.id, "back", backImage)
    ]);

    const extraImages = formData
      .getAll("extra_images")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const extraImageRefs = extraImages.length ? await storeExtraImages(item.id, extraImages) : [];

    await prisma.collectionItem.update({
      where: { id: item.id },
      data: {
        front_image_path: storedFront.originalPath,
        front_thumb_path: storedFront.thumbPath,
        back_image_path: storedBack.originalPath,
        back_thumb_path: storedBack.thumbPath,
        notes: extraImageRefs.length ? `Extra image refs: ${extraImageRefs.join(", ")}` : undefined
      }
    });

    // Analyzer always runs first (when configured) and its output is passed into OpenAI prompt context.
    const analysis = await requestCardImageAnalysis({
      collection_item_id: item.id,
      front_image_path: storedFront.originalPath,
      back_image_path: storedBack.originalPath
    });

    const pregrade = await runAiPregradePipeline({
      requestId,
      metadata: {
        year: card.year ?? undefined,
        brand: card.manufacturer ?? undefined,
        set: card.set_name,
        player: card.player_name ?? undefined,
        cardNumber: card.card_number ?? undefined,
        variant: card.parallel ?? undefined,
        sport: card.sport ?? undefined
      },
      frontImagePath: storedFront.originalPath,
      backImagePath: storedBack.originalPath,
      analyzer: analysis
    });

    await prisma.gradingRun.create({
      data: {
        collection_item_id: item.id,
        request_id: requestId,
        provider: pregrade.telemetry.provider,
        model: pregrade.telemetry.model,
        status: pregrade.telemetry.status,
        fallback_used: pregrade.telemetry.fallbackUsed,
        error_message: pregrade.telemetry.errorMessage,
        latency_ms: pregrade.telemetry.latencyMs
      }
    });

    let aiPreGradeEstimate = null;
    let gradingStatus: "estimated" | "fallback_estimated" | "needs_retake" | "failed" = "failed";
    let gradingError: string | null = null;
    let gradeEstimateId: string | null = null;

    if (pregrade.ok) {
      const estimate = pregrade.estimate;
      gradingStatus = estimate.gradingStatus;
      const range = parseEstimateRange(estimate.estimatedGradeRange);

      const gradeEstimate = await prisma.gradeEstimate.create({
        data: {
          collection_item_id: item.id,
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
          summary: estimate.rationale
        }
      });

      gradeEstimateId = gradeEstimate.id;
      aiPreGradeEstimate = {
        ...estimate,
        confidence: `${Math.round(estimate.confidence * 100)}%`
      };
    } else {
      gradingStatus = "failed";
      gradingError = pregrade.error;
    }

    return NextResponse.json({
      card: { id: card.id, player: card.player_name },
      collectionItemId: item.id,
      aiPreGradeEstimate,
      gradeEstimateId,
      gradingStatus,
      gradingError,
      requestId,
      disclaimer:
        "This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create card with images." },
      { status: 400 }
    );
  }
}
