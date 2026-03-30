"use client";

import { useMemo, useState } from "react";
import { CardDetailsStep } from "./CardDetailsStep";
import { CardImagesStep } from "./CardImagesStep";
import { CardResultsStep } from "./CardResultsStep";

export type CardDetailsInput = {
  sport: string;
  year: string;
  brand: string;
  set: string;
  cardNumber: string;
  player: string;
  team: string;
  variant: string;
  notes: string;
};

export type CardWizardResult = {
  card: { id: string; player: string | null };
  collectionItemId: string;
  aiPreGradeEstimate: {
    aiPreGradeEstimate: string;
    estimatedGradeRange: string;
    confidence: string | null;
    detectedIssues: string[];
    rationale: string | null;
  };
  comps: Array<{ grade: "PSA 8" | "PSA 9" | "PSA 10"; value: number | null }>;
};

const initialValues: CardDetailsInput = {
  sport: "",
  year: "",
  brand: "",
  set: "",
  cardNumber: "",
  player: "",
  team: "",
  variant: "",
  notes: ""
};

export function CardWizard() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [details, setDetails] = useState<CardDetailsInput>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CardWizardResult | null>(null);

  const progress = useMemo(() => {
    if (step === 1) return 33;
    if (step === 2) return 66;
    return 100;
  }, [step]);

  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">Add Card Wizard</p>
          <p className="text-sm text-slate-500">Step {step} of 3</p>
        </div>
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      {step === 1 ? (
        <CardDetailsStep
          values={details}
          onChange={(key, value) => setDetails((prev) => ({ ...prev, [key]: value }))}
          onNext={() => setStep(2)}
        />
      ) : null}

      {step === 2 ? (
        <CardImagesStep
          details={details}
          isSubmitting={isSubmitting}
          error={error}
          setError={setError}
          setSubmitting={setIsSubmitting}
          onBack={() => setStep(1)}
          onSuccess={(wizardResult) => {
            setResult(wizardResult);
            setStep(3);
          }}
        />
      ) : null}

      {step === 3 && result ? (
        <CardResultsStep
          result={result}
          onStartOver={() => {
            setDetails(initialValues);
            setResult(null);
            setError(null);
            setStep(1);
          }}
        />
      ) : null}
    </main>
  );
}
