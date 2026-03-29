import { NextResponse } from "next/server";
import { prisma } from "../../../../../../lib/prisma";
import { storeImageForCollectionItem } from "../../../../../../lib/image-storage";

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

    return NextResponse.json({ item: updatedItem });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload images." },
      { status: 400 }
    );
  }
}
