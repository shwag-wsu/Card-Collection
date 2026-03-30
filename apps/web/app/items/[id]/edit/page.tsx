import { notFound } from "next/navigation";
import { prisma } from "../../../../lib/prisma";
import { updateCollectionItem } from "../../../actions";
import { ImageUploadForm } from "./image-upload-form";

export default async function EditCollectionItemPage({ params }: { params: { id: string } }) {
  const item = await prisma.collectionItem.findUnique({
    where: { id: params.id },
    include: { card: true }
  });

  if (!item) notFound();

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Edit Collection Item</h1>
      <p className="text-sm text-slate-600">
        {item.card.player_name || "Unknown"} · {item.card.set_name || "No Set"}
      </p>
      <p className="text-sm text-slate-500">
        One collection item should represent one physical card copy.
      </p>

      <form action={updateCollectionItem} className="max-w-xl space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <input type="hidden" name="id" value={item.id} />

        <div>
          <label htmlFor="tags">Tags</label>
          <input
            id="tags"
            name="tags"
            defaultValue={item.tags || ""}
            placeholder="e.g. submit, hold, favorite, sell"
            className="mt-1 w-full"
          />
          <p className="mt-1 text-xs text-slate-500">
            Use commas to separate tags.
          </p>
        </div>

        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={4} defaultValue={item.notes || ""} className="mt-1 w-full" />
        </div>

        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Update Item
        </button>
      </form>

      {(item.front_thumb_path || item.back_thumb_path) && (
        <section className="space-y-2 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-medium">Current images</h2>
          <div className="flex flex-wrap gap-4">
            {item.front_thumb_path && (
              <img src={item.front_thumb_path} alt="Front thumbnail" width={180} height={180} className="rounded border" />
            )}
            {item.back_thumb_path && (
              <img src={item.back_thumb_path} alt="Back thumbnail" width={180} height={180} className="rounded border" />
            )}
          </div>
        </section>
      )}

      <ImageUploadForm itemId={item.id} />
    </main>
  );
}
