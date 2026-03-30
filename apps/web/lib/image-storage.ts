
import { promises as fs } from "node:fs";
import path from "node:path";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const extensionByMimeType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

const storageRoot = process.env.STORAGE_ROOT || path.join(process.cwd(), "storage");
const originalsDirectory = path.join(storageRoot, "originals");
const thumbsDirectory = path.join(storageRoot, "thumbnails");

export type ImageSide = "front" | "back";

export type StoredImagePaths = {
  originalPath: string;
  thumbPath: string;
};

const ensureDirectories = async () => {
  await fs.mkdir(originalsDirectory, { recursive: true });
  await fs.mkdir(thumbsDirectory, { recursive: true });
};

const getPaths = (collectionItemId: string, side: ImageSide, extension: string) => ({
  originalFilePath: path.join(originalsDirectory, `${collectionItemId}-${side}${extension}`),
  thumbFilePath: path.join(thumbsDirectory, `${collectionItemId}-${side}-thumb${extension}`),

  // URLs served by a route handler
  originalPath: `/api/images/originals/${collectionItemId}-${side}${extension}`,
  thumbPath: `/api/images/thumbnails/${collectionItemId}-${side}-thumb${extension}`
});

export const validateImageFile = (file: File) => {
  if (!allowedMimeTypes.has(file.type)) {
    throw new Error("Only JPEG, PNG, and WEBP images are allowed.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds 10MB size limit.");
  }
};

export const removeExistingSideFiles = async (collectionItemId: string, side: ImageSide) => {
  await ensureDirectories();

  const existingOriginals = await fs.readdir(originalsDirectory).catch(() => [] as string[]);
  const existingThumbs = await fs.readdir(thumbsDirectory).catch(() => [] as string[]);
  const prefix = `${collectionItemId}-${side}`;

  await Promise.all([
    ...existingOriginals
      .filter((fileName) => fileName.startsWith(prefix))
      .map((fileName) => fs.unlink(path.join(originalsDirectory, fileName)).catch(() => undefined)),
    ...existingThumbs
      .filter((fileName) => fileName.startsWith(`${prefix}-thumb`))
      .map((fileName) => fs.unlink(path.join(thumbsDirectory, fileName)).catch(() => undefined))
  ]);
};

export const storeImageForCollectionItem = async (
  collectionItemId: string,
  side: ImageSide,
  file: File
): Promise<StoredImagePaths> => {
  validateImageFile(file);
  await ensureDirectories();

  const extension = extensionByMimeType[file.type];
  const { originalFilePath, thumbFilePath, originalPath, thumbPath } = getPaths(
    collectionItemId,
    side,
    extension
  );

  await removeExistingSideFiles(collectionItemId, side);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // For now thumbnail is same file; later replace with real resize
  await fs.writeFile(originalFilePath, buffer);
  await fs.writeFile(thumbFilePath, buffer);

  return { originalPath, thumbPath };
};
