import Link from "next/link";
import { prisma } from "../lib/prisma";
import { createCardAndCollectionItem, deleteCollectionItem } from "./actions";

const MANUFACTURERS = [
  "Topps",
  "Bowman",
  "Fleer",
  "Upper Deck",
  "Donruss",
  "Panini",
  "Score",
  "Leaf"
];

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
    { card: { card_number: { contains: query, mode: "insensitive" } } }
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
      price_snapshots: {
        orderBy: { captured_at: "desc" },
        take: 1
      },
      grading_quotes: {
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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Card Collection</h1>
        <p className="text-sm text-slate-600">
          Add a card, then upload front/back images from the Edit screen to run the AI pre-grade.
        </p>
      </header>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Search Collection</h2>
        <form className="flex gap-2">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search player, sport, manufacturer, set, year, card #"
            className="w-full"
          />
          <button className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Search
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Add Card</h2>

        <form action={createCardAndCollectionItem} className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Card Details
            </h3>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input name="sport" placeholder="Sport (e.g. Baseball)" required />

              <input name="year" type="number" placeholder="Year" required />

              <select name="manufacturer" required defaultValue="">
                <option value="" disabled>
                  Select manufacturer
                </option>
                {MANUFACTURERS.map((manufacturer) => (
                  <option key={manufacturer} value={manufacturer}>
                    {manufacturer}
                  </option>
                ))}
              </select>

              <input name="set_name" placeholder="Set name" required />

              <input name="card_number" placeholder="Card number" required />

              <input name="player_name" placeholder="Player name" required />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
              Save Card
            </button>
            <p className="text-sm text-slate-500">
              Front/back images are uploaded after saving from the Edit page.
            </p>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-medium">Collection Items ({items.length})</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-600">
                <th className="p-2">Card</th>
                <th className="p-2">AI Pre-Grade</th>
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
                      <div className="font-medium">
                        {item.card.player_name || "Unknown Player"}
                      </div>
                      <div className="text-slate-600">
                        {item.card.year ? `${item.card.year} · ` : ""}
                        {item.card.manufacturer ? `${item.card.manufacturer} · ` : ""}
                        {item.card.sport ? `${item.card.sport} · ` : ""}
                        {item.card.set_name} #{item.card.card_number || "N/A"}
                      </div>
                    </td>

                    <td className="p-2">
                      {latestEstimate ? (
                        <div>
                          <div className="font-medium">
                            {latestEstimate.predicted_grade_low?.toString() ?? "-"} to{" "}
                            {latestEstimate.predicted_grade_high?.toString() ?? "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            AI estimate
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">Upload images</span>
                      )}
                    </td>

                    <td className="p-2">
                      {bestScenario ? (
                        <div>
                          <div className="font-medium">
                            {bestScenario.grade_label}
                          </div>
                          <div className="text-xs text-slate-500">
                            Net ${Number(bestScenario.net_after_fees).toFixed(2)}
                          </div>
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
