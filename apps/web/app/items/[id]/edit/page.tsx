import Image from "next/image";
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
        {item.card.player_name || item.card.character_name || "Unknown"} · {item.card.set_name}
      </p>

      <form action={updateCollectionItem} className="max-w-xl space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <input type="hidden" name="id" value={item.id} />

        <div>
          <label htmlFor="quantity">Quantity</label>
          <input id="quantity" name="quantity" type="number" min={1} defaultValue={item.quantity} className="mt-1 w-full" />
        </div>

        <div>
          <label htmlFor="purchase_price">Purchase Price</label>
          <input
            id="purchase_price"
            name="purchase_price"
            type="number"
            step="0.01"
            defaultValue={item.purchase_price?.toString()}
            className="mt-1 w-full"
          />
        </div>

        <div>
          <label htmlFor="ownership_status">Ownership Status</label>
          <select id="ownership_status" name="ownership_status" defaultValue={item.ownership_status} className="mt-1 w-full">
            <option value="owned">Owned</option>
            <option value="sold">Sold</option>
            <option value="wishlist">Wishlist</option>
          </select>
        </div>

        <div>
          <label htmlFor="storage_box">Storage Box</label>
          <input id="storage_box" name="storage_box" defaultValue={item.storage_box || ""} className="mt-1 w-full" />
        </div>

        <div>
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" rows={4} defaultValue={item.notes || ""} className="mt-1 w-full" />
        </div>

        <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">Update Item</button>
      </form>

      {(item.front_thumb_path || item.back_thumb_path) && (
        <section className="space-y-2 rounded-lg border bg-white p-4 shadow-sm">
          <h2 className="text-lg font-medium">Current images</h2>
          <div className="flex flex-wrap gap-4">
            {item.front_thumb_path && (
              <Image src={item.front_thumb_path} alt="Front thumbnail" width={180} height={180} className="rounded border" />
            )}
            {item.back_thumb_path && (
              <Image src={item.back_thumb_path} alt="Back thumbnail" width={180} height={180} className="rounded border" />
            )}
          </div>
        </section>
      )}

      <ImageUploadForm itemId={item.id} />
    </main>
  );
}
