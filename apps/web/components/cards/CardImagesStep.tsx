import type { CardDetailsInput, CardWizardResult } from "./CardWizard";

type Props = {
  details: CardDetailsInput;
  isSubmitting: boolean;
  error: string | null;
  onBack: () => void;
  onSuccess: (result: CardWizardResult) => void;
  setError: (value: string | null) => void;
  setSubmitting: (value: boolean) => void;
};

export function CardImagesStep({ details, isSubmitting, error, onBack, onSuccess, setError, setSubmitting }: Props) {
  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const frontImage = formData.get("front_image") as File | null;
    const backImage = formData.get("back_image") as File | null;

    if (!frontImage || frontImage.size === 0 || !backImage || backImage.size === 0) {
      setError("Front and back images are required.");
      return;
    }

    Object.entries(details).forEach(([key, value]) => {
      formData.append(key, value);
    });

    setSubmitting(true);

    try {
      const response = await fetch("/api/cards/create-with-images", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        if (payload?.card && payload?.collectionItemId) {
          onSuccess(payload as CardWizardResult);
          return;
        }

        setError(payload.error || payload.gradingError || "Unable to create card with images.");
        return;
      }

      onSuccess(payload as CardWizardResult);
    } catch {
      setError("Unexpected error while creating card.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Step 2 · Upload Images</h2>
      <p className="mt-1 text-sm text-slate-500">Upload front/back photos and optional extra angles to generate an AI pre-grade estimate.</p>

      <form onSubmit={onSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="front_image">Front image (required)</label>
          <input id="front_image" name="front_image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full" required />
        </div>

        <div>
          <label htmlFor="back_image">Back image (required)</label>
          <input id="back_image" name="back_image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full" required />
        </div>

        <div>
          <label htmlFor="extra_images">Extra images (optional)</label>
          <input id="extra_images" name="extra_images" type="file" accept="image/jpeg,image/png,image/webp" multiple className="mt-1 w-full" />
        </div>

        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This is an AI-generated pre-grade estimate based on uploaded images and is not an official PSA grade.
        </p>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
            Back to Details
          </button>
          <button type="submit" disabled={isSubmitting} className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {isSubmitting ? "Creating & analyzing..." : "Create Card & Analyze"}
          </button>
        </div>
      </form>
    </section>
  );
}
