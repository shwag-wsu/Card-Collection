import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { storeImageForCollectionItem, validateImageFile } from "../../../../lib/image-storage";
import { runCardGrading } from "../../../../lib/grading/run-card-grading";
import { identifySportsCardFromImage, type CardIdentificationResult } from "../../../../lib/card-identification";

const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const EXTRA_DIR = path.join(STORAGE_ROOT, "originals");

const toNumber = (value: FormDataEntryValue | null) => {
  const parsed = Number(value?.toString());
  return Number.isNaN(parsed) ? undefined : parsed;
};

const formString = (formData: FormData, key: string) => formData.get(key)?.toString().trim() || undefined;

const firstString = (...values: Array<string | number | null | undefined>) => {
  for (const value of values) {
    const normalized = value?.toString().trim();
    if (normalized) return normalized;
  }
  return undefined;
};

const resolveYear = (formData: FormData, identification?: CardIdentificationResult) =>
  toNumber(formData.get("year")) ?? identification?.fields.year ?? undefined;

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
    validateImageFile(frontImage);
    validateImageFile(backImage);

    const identification = await identifySportsCardFromImage(frontImage);
    if (identification.ok && !identification.result.isSportsCard && identification.result.confidence >= 0.65) {
      return NextResponse.json(
        { error: `The front image does not look like a sports card. ${identification.result.reason}` },
        { status: 400 }
      );
    }

    const identifiedFields = identification.ok ? identification.result.fields : undefined;
    const card = await prisma.card.create({
      data: {
        game: "Sports",
        sport: firstString(formString(formData, "sport"), identifiedFields?.sport) || "Unknown",
        year: resolveYear(formData, identification.ok ? identification.result : undefined),
        manufacturer: firstString(formString(formData, "brand"), identifiedFields?.brand),
        set_name: firstString(formString(formData, "set"), identifiedFields?.set) || "Unknown Set",
        card_number: firstString(formString(formData, "cardNumber"), identifiedFields?.cardNumber),
        player_name: firstString(formString(formData, "player"), identifiedFields?.player),
        notes: formString(formData, "notes"),
        parallel: firstString(formString(formData, "variant"), identifiedFields?.variant),
        variation: firstString(formString(formData, "team"), identifiedFields?.team)
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

    const grading = await runCardGrading({
      collectionItemId: item.id,
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
      backImagePath: storedBack.originalPath
    });

    return NextResponse.json({
      card: { id: card.id, player: card.player_name },
      collectionItemId: item.id,
      aiPreGradeEstimate: grading.aiPreGradeEstimate,
      gradeEstimateId: grading.gradeEstimateId,
      gradingStatus: grading.gradingStatus,
      gradingError: grading.gradingError,
      requestId: grading.requestId,
      identification: identification.ok ? identification.result : null,
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
