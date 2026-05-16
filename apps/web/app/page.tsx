import Link from "next/link";
import { prisma } from "../lib/prisma";
import { deleteCollectionItem } from "./actions";
import { AI_PRE_GRADE_COPY } from "../lib/ai-pregrade-copy";

type SearchParams = { q?: string };

type StatusTone = "green" | "blue" | "amber" | "red";

const statusClassMap: Record<"estimated" | "fallback_estimated" | "needs_retake" | "failed", string> = {
  estimated: "border-emerald-200 bg-emerald-50 text-emerald-700",
  fallback_estimated: "border-sky-200 bg-sky-50 text-sky-700",
  needs_retake: "border-amber-200 bg-amber-50 text-amber-800",
  failed: "border-rose-200 bg-rose-50 text-rose-700"
};

const toNumber = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
};

export default async function HomePage({ searchParams }: { searchParams?: SearchParams }) {
  const query = searchParams?.q?.trim() || "";
  const numericQuery = Number(query);

  const searchOr: Array<Record<string, unknown>> = [
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
      grade_estimates: { orderBy: { created_at: "desc" }, take: 1 },
      roi_scenarios: { orderBy: { calculated_at: "desc" }, take: 4 },
      grading_runs: { orderBy: { created_at: "desc" }, take: 1 }
    },
    orderBy: { created_at: "desc" }
  });

  const cardsWithAiGrade = items.filter((item) => item.grade_estimates.length > 0).length;
  const cardsNeedingPricing = items.filter((item) => item.roi_scenarios.length === 0).length;
  const potentialRoi = items.reduce((acc, item) => {
    const scenario = item.roi_scenarios.find((entry) => entry.grade_label === "PSA 10") ?? item.roi_scenarios[0];
    return acc + (toNumber(scenario?.profit_vs_total_cost_basis?.toString()) ?? 0);
  }, 0);

  return (
    <main className="space-y-7">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-900 p-6 text-white shadow-lg sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-blue-200">Card Collection</p>
            <h1 className="text-3xl font-semibold sm:text-4xl">Collection Dashboard</h1>
            <p className="max-w-2xl text-sm text-slate-200">Track your card image quality, AI pre-grade confidence, and ROI opportunities in one place.</p>
          </div>
          <Link href="/cards/new" className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-100">
            Add Card
          </Link>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-300">Total Cards</p>
            <p className="mt-2 text-2xl font-semibold">{items.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-300">Cards with AI Grade</p>
            <p className="mt-2 text-2xl font-semibold">{cardsWithAiGrade}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-300">Need Pricing</p>
            <p className="mt-2 text-2xl font-semibold">{cardsNeedingPricing}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-300">Potential ROI</p>
            <p className="mt-2 text-2xl font-semibold">${potentialRoi.toFixed(2)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input name="q" defaultValue={query} placeholder="Search player, sport, set, year, card #, or tag" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Search</button>
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Collection Items ({items.length})</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const latestEstimate = item.grade_estimates[0];
            const latestRun = item.grading_runs[0];
            const scenarios = item.roi_scenarios;
            const bestScenario = scenarios.find((scenario) => scenario.grade_label === "PSA 10") ?? scenarios.find((scenario) => scenario.grade_label === "PSA 9") ?? scenarios[0];
            const confidence = toNumber(latestEstimate?.confidence?.toString());
            const gradingStatus = latestEstimate?.grading_status ?? latestRun?.status ?? null;
            const needsRetake = gradingStatus === "needs_retake" || latestEstimate?.gradable === false;
            const detectedIssues = latestEstimate
              ? [
                  ...toStringArray(latestEstimate.detected_issues),
                  latestEstimate.blur_flag ? "Blur detected" : null,
                  latestEstimate.glare_flag ? "Glare detected" : null,
                  latestEstimate.skew_flag ? "Perspective skew detected" : null
                ].filter((issue, index, issues): issue is string => typeof issue === "string" && issues.indexOf(issue) === index)
              : [];

            return (
              <article key={item.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="h-20 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {item.front_thumb_path ? (
                      <img src={item.front_thumb_path} alt="Card thumbnail" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-semibold">{item.card.player_name || "Unknown Player"}</h3>
                    <p className="text-xs text-slate-600">{item.card.year ? `${item.card.year} · ` : ""}{item.card.manufacturer ? `${item.card.manufacturer} · ` : ""}{item.card.set_name || "No Set"} #{item.card.card_number || "N/A"}</p>
                    <p className="mt-1 text-xs text-slate-500">{item.tags || "No tags"}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{AI_PRE_GRADE_COPY.sectionTitle}</p>
                  {latestEstimate ? (
                    <>
                      {needsRetake ? (
                        <div className="mt-2 space-y-2">
                          <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Needs better photos</span>
                          {detectedIssues.length ? (
                            <p className="text-xs text-amber-900">{detectedIssues.slice(0, 2).join(" · ")}</p>
                          ) : (
                            <p className="text-xs text-amber-900">See card detail for retake guidance.</p>
                          )}
                          <Link href={`/cards/${item.card.id}`} className="text-xs font-medium text-blue-600 hover:underline">Full guidance</Link>
                        </div>
                      ) : (
                        <>
                          <p className="mt-1 font-semibold text-slate-900">{latestEstimate.predicted_grade_low?.toString() ?? "-"} to {latestEstimate.predicted_grade_high?.toString() ?? "-"}</p>
                          <div className="mt-2 h-2 rounded-full bg-slate-200">
                            <div className="h-2 rounded-full bg-violet-500" style={{ width: `${Math.max(3, Math.min(100, Math.round((confidence ?? 0) * 100)))}%` }} />
                          </div>
                          <p className="mt-1 text-xs text-slate-600">Confidence: {confidence !== null ? `${Math.round(confidence * 100)}%` : "N/A"}</p>
                        </>
                      )}
                      {gradingStatus ? <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusClassMap[(gradingStatus as keyof typeof statusClassMap) || "failed"]}`}>{gradingStatus}</span> : null}
                      <p className="mt-2 text-xs text-slate-500">{AI_PRE_GRADE_COPY.disclaimer}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">Upload images to estimate condition.</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">ROI</p>
                  {bestScenario ? (
                    <>
                      <p className="mt-1 font-semibold text-slate-900">{bestScenario.grade_label}</p>
                      <p className="text-xs text-slate-600">Net ${Number(bestScenario.net_after_fees).toFixed(2)}</p>
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-slate-500">Needs pricing inputs</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 text-sm">
                  <Link href={`/cards/${item.card.id}`} className="text-blue-600 hover:underline">Card</Link>
                  <Link href={`/items/${item.id}/edit`} className="text-blue-600 hover:underline">Edit</Link>
                  <form action={deleteCollectionItem} className="inline">
                    <input type="hidden" name="id" value={item.id} />
                    <button className="text-rose-600 hover:underline">Delete</button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
