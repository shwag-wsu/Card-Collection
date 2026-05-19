import { NextResponse } from "next/server";
import { identifySportsCardFromImage } from "../../../../lib/card-identification";
import { validateImageFile } from "../../../../lib/image-storage";

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File) || image.size === 0) {
    return NextResponse.json({ error: "Provide an image file." }, { status: 400 });
  }

  try {
    validateImageFile(image);
    const identification = await identifySportsCardFromImage(image);

    if (!identification.ok) {
      return NextResponse.json({ error: identification.error }, { status: 503 });
    }

    return NextResponse.json(identification.result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to identify card image." },
      { status: 400 }
    );
  }
}
