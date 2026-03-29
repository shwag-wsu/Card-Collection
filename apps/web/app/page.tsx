import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createCardAndCollectionItem, deleteCollectionItem } from "./actions";

export default async function HomePage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const query = searchParams?.q?.trim() || "";

  const items = await prisma.collectionItem.findMany({
    where: query
      ? {
          OR: [
            { card: { player_name: { contains: query, mode: "insensitive" } } },
            { card: { character_name: { contains: query, mode: "insensitive" } } },
            { card: { set_name: { contains: query, mode: "insensitive" } } },
            { card: { game: { contains: query, mode: "insensitive" } } },
            { card: { card_number: { contains: query, mode: "insensitive" } } }
          ]
        }
      : undefined,
    include: { card: true },
    orderBy: { created_at: "desc" }
  });

  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Card Collection</h1>
        <p className="text-sm text-slate-600">Basic CRUD for cards + collection items.</p>
      </header>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Search Collection</h2>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search player, set, game, card #"
            className="w-full"
          />
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Search</button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Add Card + Collection Item</h2>
        <form action={createCardAndCollectionItem} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <input name="game" placeholder="Game (e.g. Pokemon)" required />
          <input name="set_name" placeholder="Set name" required />
          <input name="year" type="number" placeholder="Year" />
          <input name="manufacturer" placeholder="Manufacturer" />
          <input name="player_name" placeholder="Player name" />
          <input name="character_name" placeholder="Character name" />
          <input name="card_number" placeholder="Card number" />
          <input name="quantity" type="number" min={1} defaultValue={1} placeholder="Quantity" />
          <input name="purchase_price" type="number" step="0.01" placeholder="Purchase price (USD)" />
          <select name="ownership_status" defaultValue="owned">
            <option value="owned">Owned</option>
            <option value="sold">Sold</option>
            <option value="wishlist">Wishlist</option>
          </select>
          <textarea name="item_notes" placeholder="Item notes" className="md:col-span-2" rows={3} />
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white md:col-span-2 md:justify-self-start">
            Save
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Collection Items ({items.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="p-2">Card</th>
                <th className="p-2">Qty</th>
                <th className="p-2">Status</th>
                <th className="p-2">Purchase</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: Prisma.CollectionItemGetPayload<{ include: { card: true } }>) => (
                <tr key={item.id} className="border-b align-top">
                  <td className="p-2">
                    <div className="font-medium">{item.card.player_name || item.card.character_name || "Unknown"}</div>
                    <div className="text-slate-600">
                      {item.card.year ? `${item.card.year} ` : ""}
                      {item.card.set_name} #{item.card.card_number || "N/A"}
                    </div>
                  </td>
                  <td className="p-2">{item.quantity}</td>
                  <td className="p-2 capitalize">{item.ownership_status}</td>
                  <td className="p-2">{item.purchase_price ? `$${item.purchase_price.toString()}` : "-"}</td>
                  <td className="space-x-3 p-2">
                    <Link href={`/cards/${item.card.id}`} className="text-blue-600 hover:underline">
                      Card
                    </Link>
                    <Link href={`/items/${item.id}/edit`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <form action={deleteCollectionItem} className="inline">
                      <input type="hidden" name="id" value={item.id} />
                      <button className="text-rose-600 hover:underline">Delete</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
