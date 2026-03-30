import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { storeImageForCollectionItem, validateImageFile } from "../../../../lib/image-storage";
import { lookupEbayPsaComps } from "../../../../lib/market/ebay";
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

    const pregrade = await runAiPregradePipeline({
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

    if (!pregrade.ok) {
      return NextResponse.json(
        {
          card: { id: card.id, player: card.player_name },
          collectionItemId: item.id,
          gradingError: pregrade.error,
          marketError: "Skipped market lookup because grading failed.",
          aiPreGradeEstimate: null,
          comps: null,
          disclaimer:
            "This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade."
        },
        { status: 502 }
      );
    }

    const estimate = pregrade.estimate;

    const gradeEstimate = await prisma.gradeEstimate.create({
      data: {
        collection_item_id: item.id,
        analyzer_version: pregrade.analyzer.analyzer_version ?? "ai-pregrade-v1",
        image_quality_score: pregrade.analyzer.image_quality_score,
        blur_flag: pregrade.analyzer.blur_flag ?? estimate.detectedIssues.includes("blur"),
        glare_flag: pregrade.analyzer.glare_flag ?? estimate.detectedIssues.includes("glare"),
        skew_flag: pregrade.analyzer.skew_flag ?? estimate.detectedIssues.includes("skew"),
        centering_score: estimate.subscores.centering,
        corners_score: estimate.subscores.corners,
        edges_score: estimate.subscores.edges,
        surface_score: estimate.subscores.surface,
        predicted_grade_low: Number(estimate.estimatedGradeRange.split(" - ")[0]),
        predicted_grade_high: Number(estimate.estimatedGradeRange.split(" - ")[1]),
        confidence: estimate.confidence,
        summary: estimate.rationale
      }
    });

    let comps = null;
    let marketError: string | null = null;

    try {
      comps = await lookupEbayPsaComps({
        year: card.year ?? undefined,
        brand: card.manufacturer ?? undefined,
        set: card.set_name,
        player: card.player_name ?? undefined,
        cardNumber: card.card_number ?? undefined,
        variant: card.parallel ?? undefined
      });

      await prisma.priceSnapshot.create({
        data: {
          collection_item_id: item.id,
          provider: "ebay-browse-api",
          currency: "USD",
          grade_8_value: comps.find((comp) => comp.grade === "PSA 8")?.avgPrice ?? null,
          grade_9_value: comps.find((comp) => comp.grade === "PSA 9")?.avgPrice ?? null,
          grade_10_value: comps.find((comp) => comp.grade === "PSA 10")?.avgPrice ?? null,
          source_note:
            "eBay Browse API active listings (FIXED_PRICE and AUCTION). Sold/completed data is not included in this implementation."
        }
      });
    } catch (error) {
      console.error("Market lookup failed", error);
      marketError = "Market data unavailable";
    }

    return NextResponse.json({
      card: { id: card.id, player: card.player_name },
      collectionItemId: item.id,
      aiPreGradeEstimate: {
        ...estimate,
        confidence: `${Math.round(estimate.confidence * 100)}%`
      },
      gradeEstimateId: gradeEstimate.id,
      gradingError: null,
      marketError,
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
