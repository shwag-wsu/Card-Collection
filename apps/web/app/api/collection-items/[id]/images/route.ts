import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { storeImageForCollectionItem } from "../../../../../lib/image-storage";
import { runCardGrading } from "../../../../../lib/grading/run-card-grading";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const collectionItem = await prisma.collectionItem.findUnique({
    where: { id: params.id },
    include: { card: true }
  });
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

    const grading = await runCardGrading({
      collectionItemId: params.id,
      metadata: {
        year: collectionItem.card.year ?? undefined,
        brand: collectionItem.card.manufacturer ?? undefined,
        set: collectionItem.card.set_name,
        player: collectionItem.card.player_name ?? undefined,
        cardNumber: collectionItem.card.card_number ?? undefined,
        variant: collectionItem.card.parallel ?? undefined,
        sport: collectionItem.card.sport ?? undefined
      },
      frontImagePath: updatedItem.front_image_path ?? undefined,
      backImagePath: updatedItem.back_image_path ?? undefined
    });

    console.info(
      JSON.stringify({
        level: "info",
        event: "existing_card_photo_update_grading_triggered",
        request_id: grading.requestId,
        collection_item_id: params.id,
        grading_status: grading.gradingStatus,
        fallback_used: grading.fallbackUsed,
        openai_used: grading.openAiUsed
      })
    );

    return NextResponse.json({
      item: updatedItem,
      aiPreGradeEstimate: grading.aiPreGradeEstimate,
      gradeEstimateId: grading.gradeEstimateId,
      gradingStatus: grading.gradingStatus,
      gradingError: grading.gradingError,
      requestId: grading.requestId,
      disclaimer:
        "This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade."
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload images." },
      { status: 400 }
    );
  }
}
