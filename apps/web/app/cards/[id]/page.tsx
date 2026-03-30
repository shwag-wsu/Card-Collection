import Link from "next/link";
import { notFound } from "next/navigation";
import { calculateRoiScenarios, createGradingQuote, createPriceSnapshot } from "../../actions";
import { prisma } from "../../../lib/prisma";
import { AI_PRE_GRADE_COPY, formatConfidenceBadge } from "../../../lib/ai-pregrade-copy";

const formatMoney = (value: number | string | null | undefined) => {
  if (value === null || value === undefined) return "-";
  const amount = typeof value === "string" ? Number(value) : Number(value);
  if (Number.isNaN(amount)) return "-";
  return `$${amount.toFixed(2)}`;
};

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
          {card.collection_items.map((item: (typeof card.collection_items)[number]) => {
            const latestEstimate = item.grade_estimates[0];
            const latestSnapshot = item.price_snapshots[0];
            const latestQuote = item.grading_quotes[0];
            const scenarios = item.roi_scenarios;

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
                        <img
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
                        <img
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
                  <div className="space-y-3 rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-4 text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-indigo-950">{AI_PRE_GRADE_COPY.sectionTitle}</h3>
                      <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700">
                        {AI_PRE_GRADE_COPY.helperText}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600">{AI_PRE_GRADE_COPY.resultsIntro}</p>

                    <div className="grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-md border border-indigo-100 bg-white p-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {AI_PRE_GRADE_COPY.rangeLabel}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-indigo-900">
                          {latestEstimate.predicted_grade_low?.toString() ?? "-"} to{" "}
                          {latestEstimate.predicted_grade_high?.toString() ?? "-"}
                        </p>
                      </div>
                      <div className="rounded-md border border-indigo-100 bg-white p-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {AI_PRE_GRADE_COPY.confidenceLabel}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-indigo-900">
                          {formatConfidenceBadge(latestEstimate.confidence?.toString())}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-md border border-indigo-100 bg-white p-2 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {AI_PRE_GRADE_COPY.conditionLabel}
                      </p>
                      <p className="mt-1">{latestEstimate.summary || "No additional rationale available yet."}</p>
                    </div>

                    <div className="rounded-md border border-indigo-100 bg-white p-2 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        {AI_PRE_GRADE_COPY.issuesLabel}
                      </p>
                      <ul className="mt-1 list-inside list-disc space-y-1 text-slate-600">
                        <li>{latestEstimate.blur_flag ? "Blur detected in uploaded image" : "No major blur detected"}</li>
                        <li>{latestEstimate.glare_flag ? "Glare detected in uploaded image" : "No major glare detected"}</li>
                        <li>{latestEstimate.skew_flag ? "Perspective skew detected" : "No major perspective skew detected"}</li>
                      </ul>
                    </div>

                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      {AI_PRE_GRADE_COPY.disclaimer}
                    </p>
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-3">
                  <form action={createPriceSnapshot} className="space-y-2 rounded-md border bg-slate-50 p-3">
                    <h3 className="font-medium">Manual Price Snapshot</h3>
                    <p className="text-xs text-slate-500">
                      Comparable market values by official PSA grade. Use these as reference points alongside the AI pre-grade estimate.
                    </p>
                    <input type="hidden" name="collection_item_id" value={item.id} />
                    <input type="hidden" name="card_id" value={card.id} />
                    <input name="provider" placeholder="Provider (manual, eBay, etc.)" defaultValue="manual" />
                    <input name="currency" placeholder="Currency" defaultValue="USD" />
                    <input name="raw_low" type="number" step="0.01" placeholder="Raw low" />
                    <input name="raw_mid" type="number" step="0.01" placeholder="Raw mid" />
                    <input name="raw_high" type="number" step="0.01" placeholder="Raw high" />
                    <input name="grade_8_value" type="number" step="0.01" placeholder="PSA 8 value" />
                    <input name="grade_9_value" type="number" step="0.01" placeholder="PSA 9 value" />
                    <input name="grade_10_value" type="number" step="0.01" placeholder="PSA 10 value" />
                    <input name="source_note" placeholder="Source note" />
                    <button className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white">
                      Save Price Snapshot
                    </button>
                  </form>

                  <form action={createGradingQuote} className="space-y-2 rounded-md border bg-slate-50 p-3">
                    <h3 className="font-medium">Grading Quote</h3>
                    <input type="hidden" name="collection_item_id" value={item.id} />
                    <input type="hidden" name="card_id" value={card.id} />
                    <input name="grader" placeholder="Grader" defaultValue="PSA" />
                    <input name="service_level" placeholder="Service level" defaultValue="Value" />
                    <input name="declared_value" type="number" step="0.01" placeholder="Declared value" />
                    <input name="grading_fee" type="number" step="0.01" placeholder="Grading fee" required />
                    <input name="shipping_to_grader" type="number" step="0.01" placeholder="Shipping to grader" />
                    <input name="return_shipping" type="number" step="0.01" placeholder="Return shipping" />
                    <input name="insurance_cost" type="number" step="0.01" placeholder="Insurance" />
                    <input name="other_costs" type="number" step="0.01" placeholder="Other costs" />
                    <button className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white">
                      Save Grading Quote
                    </button>
                  </form>

                  <form action={calculateRoiScenarios} className="space-y-2 rounded-md border bg-slate-50 p-3">
                    <h3 className="font-medium">ROI Scenarios</h3>
                    <input type="hidden" name="collection_item_id" value={item.id} />
                    <input type="hidden" name="card_id" value={card.id} />
                    <p className="text-xs text-slate-600">Calculates raw plus PSA 8/9/10 comparison scenarios from your latest manual inputs.</p>
                    <input
                      name="selling_fee_pct"
                      type="number"
                      step="0.01"
                      defaultValue={13}
                      placeholder="Selling fee %"
                    />
                    <button className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white">
                      Calculate ROI
                    </button>
                  </form>
                </div>

                {(latestSnapshot || latestQuote || scenarios.length > 0) && (
                  <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <h3 className="font-medium text-emerald-900">Latest Manual Inputs & ROI</h3>

                    {latestSnapshot && (
                      <p className="text-xs text-emerald-900">
                        Snapshot ({latestSnapshot.provider}): Raw mid {formatMoney(latestSnapshot.raw_mid?.toString())} · Comparable official PSA 8{" "}
                        {formatMoney(latestSnapshot.grade_8_value?.toString())} · PSA 9{" "}
                        {formatMoney(latestSnapshot.grade_9_value?.toString())} · PSA 10{" "}
                        {formatMoney(latestSnapshot.grade_10_value?.toString())}
                      </p>
                    )}

                    {latestQuote && (
                      <p className="text-xs text-emerald-900">
                        Quote ({latestQuote.grader} {latestQuote.service_level}): total grading cost{" "}
                        {formatMoney(latestQuote.total_cost.toString())}
                      </p>
                    )}

                    {scenarios.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="border-b border-emerald-200 text-left">
                              <th className="p-1">Scenario</th>
                              <th className="p-1">Sale</th>
                              <th className="p-1">Selling Fees</th>
                              <th className="p-1">Grading Cost</th>
                              <th className="p-1">Net Proceeds</th>
                              <th className="p-1">Profit vs Raw</th>
                              <th className="p-1">Profit vs Cost Basis</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scenarios.map((scenario: (typeof scenarios)[number]) => (
                              <tr key={scenario.id} className="border-b border-emerald-100">
                                <td className="p-1 font-medium">{scenario.grade_label}</td>
                                <td className="p-1">{formatMoney(scenario.expected_sale_price.toString())}</td>
                                <td className="p-1">{formatMoney(scenario.selling_fee_amount?.toString())}</td>
                                <td className="p-1">{formatMoney(scenario.grading_cost.toString())}</td>
                                <td className="p-1">{formatMoney(scenario.net_after_fees.toString())}</td>
                                <td className="p-1">{formatMoney(scenario.profit_vs_raw_sale?.toString())}</td>
                                <td className="p-1">{formatMoney(scenario.profit_vs_total_cost_basis?.toString())}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
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
