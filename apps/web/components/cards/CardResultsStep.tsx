import Link from "next/link";
import type { CardWizardResult } from "./CardWizard";

type Props = {
  result: CardWizardResult;
  onStartOver: () => void;
};

export function CardResultsStep({ result, onStartOver }: Props) {
  const estimate = result.aiPreGradeEstimate;
  const showRetake = result.gradingStatus === "needs_retake" || (estimate && !estimate.gradable);

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-2xl font-semibold">AI Pre-Grade Estimate</h2>
        <p className="text-sm text-slate-500">Created card for {result.card.player || "Unknown Player"} and finished image analysis.</p>
      </div>

      {!estimate ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <p className="font-semibold">AI pre-grade estimate unavailable</p>
          <p className="mt-1">{result.gradingError || "The grading service failed for this upload. Please retry with clearer front/back photos."}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-700">Estimated Grade Range</p>
              <p className="mt-1 text-2xl font-semibold text-blue-900">{estimate.estimatedGradeRange}</p>
            </div>

            <div className="rounded-xl border border-violet-100 bg-violet-50 p-4">
              <p className="text-xs uppercase tracking-wide text-violet-700">Confidence</p>
              <p className="mt-1 text-2xl font-semibold text-violet-900">{estimate.confidence ?? "N/A"}</p>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-700">Visible Issues</p>
              <p className="mt-1 text-sm font-semibold text-emerald-900">{estimate.detectedIssues.length ? estimate.detectedIssues.join(", ") : "None flagged"}</p>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs uppercase tracking-wide text-amber-700">Grading Status</p>
              <p className="mt-1 text-sm font-semibold text-amber-900">{result.gradingStatus}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-medium text-slate-700">Rationale</p>
            <p className="mt-1 text-slate-600">{estimate.rationale || "The model used image quality and condition signals from the uploaded photos."}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700 sm:grid-cols-4">
              <p>Centering: {estimate.subscores.centering.toFixed(1)}</p>
              <p>Corners: {estimate.subscores.corners.toFixed(1)}</p>
              <p>Edges: {estimate.subscores.edges.toFixed(1)}</p>
              <p>Surface: {estimate.subscores.surface.toFixed(1)}</p>
            </div>
          </div>

          {estimate.limitations.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <p className="font-semibold">Limitations</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {estimate.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {showRetake && estimate.retakeGuidance.length ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
              <p className="font-semibold">Retake guidance (grading reliability is low)</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {estimate.retakeGuidance.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}

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
