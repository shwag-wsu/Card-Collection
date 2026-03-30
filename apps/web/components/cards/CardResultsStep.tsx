import Link from "next/link";
import type { CardWizardResult } from "./CardWizard";

type Props = {
  result: CardWizardResult;
  onStartOver: () => void;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CardResultsStep({ result, onStartOver }: Props) {
  const estimate = result.aiPreGradeEstimate;

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-2xl font-semibold">AI Pre-Grade Estimate</h2>
        <p className="text-sm text-slate-500">Created card for {result.card.player || "Unknown Player"} and finished image analysis.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs uppercase tracking-wide text-blue-700">Estimated PSA-like range</p>
          <p className="mt-1 text-2xl font-semibold text-blue-900">{estimate.estimatedGradeRange}</p>
        </div>

        <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
          <p className="text-xs uppercase tracking-wide text-violet-700">Confidence</p>
          <p className="mt-1 text-2xl font-semibold text-violet-900">{estimate.confidence ?? "N/A"}</p>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Detected issues</p>
          <p className="mt-1 text-sm font-semibold text-emerald-900">{estimate.detectedIssues.length ? estimate.detectedIssues.join(", ") : "None flagged"}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
        <p className="font-medium text-slate-700">Rationale</p>
        <p className="mt-1 text-slate-600">{estimate.rationale || "The model used image quality and condition signals from the uploaded photos."}</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900">Comparable market values</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {result.comps.map((comp) => (
            <div key={comp.grade} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="text-slate-500">{comp.grade}</p>
              <p className="text-lg font-semibold text-slate-900">{comp.value !== null ? money.format(comp.value) : "N/A"}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link href={`/cards/${result.card.id}`} className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">
          View Card
        </Link>
        <Link href="/" className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700">
          Back to Collection
        </Link>
        <button onClick={onStartOver} className="rounded-full border border-blue-300 px-5 py-2.5 text-sm font-semibold text-blue-700">
          Add Another Card
        </button>
      </div>
    </section>
  );
}
