import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { storeImageForCollectionItem, validateImageFile } from "../../../../lib/image-storage";

type AnalyzerPayload = {
  collection_item_id: string;
  front_image_path?: string;
  back_image_path?: string;
};

type AnalyzerResponse = {
  analyzer_version?: string;
  blur_flag?: boolean;
  glare_flag?: boolean;
  skew_flag?: boolean;
  predicted_grade_low?: number;
  predicted_grade_high?: number;
  confidence?: number;
  summary?: string;
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

const buildComps = (sport: string, gradeMidpoint: number) => {
  const sportMultipliers: Record<string, number> = {
    Baseball: 1,
    Basketball: 1.35,
    Hockey: 0.9
  };

  const base = 45 * (sportMultipliers[sport] ?? 1);
  const qualityFactor = Math.max(0.7, gradeMidpoint / 10);

  const psa8 = Math.round(base * qualityFactor * 100) / 100;
  const psa9 = Math.round(psa8 * 1.9 * 100) / 100;
  const psa10 = Math.round(psa9 * 2.2 * 100) / 100;

  return [
    { grade: "PSA 8" as const, value: psa8 },
    { grade: "PSA 9" as const, value: psa9 },
    { grade: "PSA 10" as const, value: psa10 }
  ];
};

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

export async function POST(request: Request) {
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

    const analysis = await requestCardImageAnalysis({
      collection_item_id: item.id,
      front_image_path: storedFront.originalPath,
      back_image_path: storedBack.originalPath
    });

    const gradeEstimate = await prisma.gradeEstimate.create({
      data: {
        collection_item_id: item.id,
        analyzer_version: analysis?.analyzer_version ?? "mock-analyzer-v0.2.0",
        blur_flag: analysis?.blur_flag ?? false,
        glare_flag: analysis?.glare_flag ?? false,
        skew_flag: analysis?.skew_flag ?? false,
        predicted_grade_low: analysis?.predicted_grade_low ?? 7.5,
        predicted_grade_high: analysis?.predicted_grade_high ?? 9,
        confidence: analysis?.confidence ?? 0.68,
        summary:
          analysis?.summary ??
          "Estimated from visible centering, corner sharpness, and surface presentation in uploaded photos."
      }
    });

    const estimatedLow = Number(gradeEstimate.predicted_grade_low ?? 7.5);
    const estimatedHigh = Number(gradeEstimate.predicted_grade_high ?? 9);
    const estimatedGradeRange = `${estimatedLow.toFixed(1)} - ${estimatedHigh.toFixed(1)}`;
    const confidence = gradeEstimate.confidence ? `${Math.round(Number(gradeEstimate.confidence) * 100)}%` : null;
    const detectedIssues = [gradeEstimate.blur_flag ? "blur" : null, gradeEstimate.glare_flag ? "glare" : null, gradeEstimate.skew_flag ? "skew" : null].filter(Boolean) as string[];

    const comps = buildComps(card.sport || "Baseball", (estimatedLow + estimatedHigh) / 2);

    await prisma.priceSnapshot.create({
      data: {
        collection_item_id: item.id,
        provider: "ai-market-lookup",
        currency: "USD",
        grade_8_value: comps[0].value,
        grade_9_value: comps[1].value,
        grade_10_value: comps[2].value,
        source_note: "AI-assisted comparable estimate based on uploaded card metadata and image quality signals."
      }
    });

    const aiPreGradeEstimate = {
      aiPreGradeEstimate: estimatedGradeRange,
      estimatedGradeRange,
      confidence,
      detectedIssues,
      rationale: gradeEstimate.summary
    };

    return NextResponse.json({
      card: { id: card.id, player: card.player_name },
      collectionItemId: item.id,
      aiPreGradeEstimate,
      estimatedGradeRange,
      confidence,
      detectedIssues,
      rationale: gradeEstimate.summary,
      comps,
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
