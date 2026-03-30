import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const storageRoot = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");

const mimeTypeByExtension: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function GET(
  request: Request,
  { params }: { params: { kind: string; filename: string } }
) {
  const { kind, filename } = params;

  if (!["originals", "thumbnails"].includes(kind)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = path.join(storageRoot, kind, filename);

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = mimeTypeByExtension[ext] || "application/octet-stream";

    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
