import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";

export default async function CardDetailPage({ params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: { collection_items: { orderBy: { created_at: "desc" } } }
  });

  if (!card) notFound();

  return (
    <main className="space-y-6">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Back to collection
      </Link>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold">{card.player_name || card.character_name || "Unknown Card"}</h1>
        <p className="text-slate-600">
          {card.year ? `${card.year} ` : ""}
          {card.manufacturer ? `${card.manufacturer} · ` : ""}
          {card.game} · {card.set_name} #{card.card_number || "N/A"}
        </p>
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="mb-2 text-lg font-medium">Collection Items</h2>
        <ul className="space-y-2">
          {card.collection_items.map((item) => (
            <li key={item.id} className="rounded border p-3 text-sm">
              Qty: {item.quantity} · Status: <span className="capitalize">{item.ownership_status}</span> · Purchase:{" "}
              {item.purchase_price ? `$${item.purchase_price.toString()}` : "-"}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
