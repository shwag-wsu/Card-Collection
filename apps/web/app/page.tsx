import Link from "next/link";
import { prisma } from "../lib/prisma";
import { deleteCollectionItem } from "./actions";
import { AI_PRE_GRADE_COPY } from "../lib/ai-pregrade-copy";

export default async function HomePage({
  searchParams
}: {
  searchParams?: { q?: string };
}) {
  const query = searchParams?.q?.trim() || "";
  const numericQuery = Number(query);

  const searchOr: any[] = [
    { card: { player_name: { contains: query, mode: "insensitive" } } },
    { card: { sport: { contains: query, mode: "insensitive" } } },
    { card: { manufacturer: { contains: query, mode: "insensitive" } } },
    { card: { set_name: { contains: query, mode: "insensitive" } } },
    { card: { card_number: { contains: query, mode: "insensitive" } } },
    { tags: { contains: query, mode: "insensitive" } }
  ];

  if (!Number.isNaN(numericQuery)) {
    searchOr.push({ card: { year: numericQuery } });
  }

  const items = await prisma.collectionItem.findMany({
    where: query ? { OR: searchOr } : undefined,
    include: {
      card: true,
      grade_estimates: {
        orderBy: { created_at: "desc" },
        take: 1
      },
      roi_scenarios: {
        orderBy: { calculated_at: "desc" },
        take: 4
      }
    },
    orderBy: { created_at: "desc" }
  });

  return (
    <main className="space-y-8">
      <header className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-3xl font-semibold">Collection Dashboard</h1>
        <p className="text-sm text-slate-600">
          Use the menu to open <span className="font-semibold">Add Card</span>, then complete details, image upload, and review the AI pre-grade estimate.
        </p>
        <Link href="/cards/new" className="inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Open Add Card Wizard
        </Link>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Search Collection</h2>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search player, sport, manufacturer, set, year, card #, tag"
            className="w-full"
          />
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">Search</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Collection Items ({items.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="p-2">Card</th>
                <th className="p-2">Tags</th>
                <th className="p-2">{AI_PRE_GRADE_COPY.sectionTitle}</th>
                <th className="p-2">ROI</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const latestEstimate = item.grade_estimates[0];
                const scenarios = item.roi_scenarios;
                const bestScenario =
                  scenarios.find((scenario) => scenario.grade_label === "PSA 10") ??
                  scenarios.find((scenario) => scenario.grade_label === "PSA 9") ??
                  scenarios[0];

                return (
                  <tr key={item.id} className="border-b align-top">
                    <td className="p-2">
                      <div className="font-medium">{item.card.player_name || "Unknown Player"}</div>
                      <div className="text-slate-600">
                        {item.card.year ? `${item.card.year} · ` : ""}
                        {item.card.manufacturer ? `${item.card.manufacturer} · ` : ""}
                        {item.card.sport ? `${item.card.sport} · ` : ""}
                        {item.card.set_name || "No Set"} #{item.card.card_number || "N/A"}
                      </div>
                    </td>

                    <td className="p-2">
                      {item.tags ? <span className="text-slate-700">{item.tags}</span> : <span className="text-slate-400">—</span>}
                    </td>

                    <td className="p-2">
                      {latestEstimate ? (
                        <div>
                          <div className="font-medium">
                            {latestEstimate.predicted_grade_low?.toString() ?? "-"} to {latestEstimate.predicted_grade_high?.toString() ?? "-"}
                          </div>
                          <div className="text-xs text-slate-500">{AI_PRE_GRADE_COPY.rangeLabel}</div>
                          <div className="text-xs text-slate-500">{AI_PRE_GRADE_COPY.disclaimer}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Upload images</span>
                      )}
                    </td>

                    <td className="p-2">
                      {bestScenario ? (
                        <div>
                          <div className="font-medium">{bestScenario.grade_label}</div>
                          <div className="text-xs text-slate-500">Net ${Number(bestScenario.net_after_fees).toFixed(2)}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Needs pricing inputs</span>
                      )}
                    </td>

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
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
