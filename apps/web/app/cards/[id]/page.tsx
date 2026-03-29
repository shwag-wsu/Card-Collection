import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/prisma";

export default async function CardDetailPage({ params }: { params: { id: string } }) {
  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      collection_items: {
        orderBy: { created_at: "desc" },
        include: {
          grade_estimates: {
            orderBy: { created_at: "desc" },
            take: 1
          }
        }
      }
    }
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
          {card.collection_items.map((item) => {
            const latestEstimate = item.grade_estimates[0];

            return (
              <li key={item.id} className="space-y-3 rounded border p-3 text-sm">
                <div>
                  Qty: {item.quantity} · Status: <span className="capitalize">{item.ownership_status}</span> · Purchase:{" "}
                  {item.purchase_price ? `$${item.purchase_price.toString()}` : "-"}
                </div>

                {(item.front_thumb_path || item.back_thumb_path) && (
                  <div className="flex flex-wrap gap-3">
                    {item.front_thumb_path && (
                      <a href={item.front_image_path || item.front_thumb_path} target="_blank" rel="noreferrer">
                        <Image
                          src={item.front_thumb_path}
                          alt="Front preview"
                          width={140}
                          height={140}
                          className="rounded border"
                        />
                      </a>
                    )}
                    {item.back_thumb_path && (
                      <a href={item.back_image_path || item.back_thumb_path} target="_blank" rel="noreferrer">
                        <Image
                          src={item.back_thumb_path}
                          alt="Back preview"
                          width={140}
                          height={140}
                          className="rounded border"
                        />
                      </a>
                    )}
                  </div>
                )}

                {latestEstimate && (
                  <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-slate-700">
                    <h3 className="font-medium text-indigo-900">AI Pre-Grade Estimate</h3>
                    <p className="mt-1">
                      Likely grade range: <strong>{latestEstimate.predicted_grade_low?.toString() ?? "-"}</strong> to{" "}
                      <strong>{latestEstimate.predicted_grade_high?.toString() ?? "-"}</strong>
                      {latestEstimate.confidence ? (
                        <span className="ml-2 text-xs text-indigo-800">
                          ({Math.round(Number(latestEstimate.confidence) * 100)}% confidence)
                        </span>
                      ) : null}
                    </p>
                    {latestEstimate.summary ? <p className="mt-1 text-xs">{latestEstimate.summary}</p> : null}
                    <p className="mt-1 text-xs text-indigo-800">
                      Disclaimer: This AI estimate is for guidance only and is not an official PSA grade.
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
