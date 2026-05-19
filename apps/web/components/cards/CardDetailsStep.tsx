import { useState } from "react";
import type { CardDetailsInput } from "./CardWizard";

type Props = {
  values: CardDetailsInput;
  onChange: (key: keyof CardDetailsInput, value: string) => void;
  onNext: () => void;
};

type IdentificationPayload = {
  isSportsCard: boolean;
  confidence: number;
  reason: string;
  fields: Partial<Record<keyof CardDetailsInput, string | number | null>>;
  error?: string;
};

const sports = ["Baseball", "Basketball", "Football", "Hockey", "Soccer", "Racing", "Golf", "Tennis", "Wrestling", "MMA"];

export function CardDetailsStep({ values, onChange, onNext }: Props) {
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identificationMessage, setIdentificationMessage] = useState<string | null>(null);
  const [identificationError, setIdentificationError] = useState<string | null>(null);
  const requiredFields: (keyof CardDetailsInput)[] = ["sport", "year", "brand", "cardNumber", "player"];
  const isValid = requiredFields.every((field) => values[field].trim().length > 0);

  const applyIdentification = (payload: IdentificationPayload) => {
    const fields: Partial<Record<keyof CardDetailsInput, string>> = {
      sport: payload.fields.sport?.toString(),
      year: payload.fields.year?.toString(),
      brand: payload.fields.brand?.toString(),
      set: payload.fields.set?.toString(),
      cardNumber: payload.fields.cardNumber?.toString(),
      player: payload.fields.player?.toString(),
      team: payload.fields.team?.toString(),
      variant: payload.fields.variant?.toString()
    };

    Object.entries(fields).forEach(([key, value]) => {
      if (value && !values[key as keyof CardDetailsInput].trim()) {
        onChange(key as keyof CardDetailsInput, value);
      }
    });
  };

  const identifyFromPhoto = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIdentificationError(null);
    setIdentificationMessage(null);

    const formData = new FormData(event.currentTarget);
    const image = formData.get("image") as File | null;
    if (!image || image.size === 0) {
      setIdentificationError("Select a front image first.");
      return;
    }

    setIsIdentifying(true);
    try {
      const response = await fetch("/api/cards/identify-image", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json()) as IdentificationPayload;

      if (!response.ok) {
        setIdentificationError(payload.error || "Unable to identify this image.");
        return;
      }

      if (!payload.isSportsCard) {
        setIdentificationError(`This does not look like a sports card. ${payload.reason}`);
        return;
      }

      applyIdentification(payload);
      setIdentificationMessage(`Found sports card details with ${Math.round(payload.confidence * 100)}% confidence. ${payload.reason}`);
    } catch {
      setIdentificationError("Unexpected error while identifying the image.");
    } finally {
      setIsIdentifying(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Step 1 - Card Details</h2>
      <p className="mt-1 text-sm text-slate-500">Capture the core details manually or fill them from a front photo.</p>

      <form onSubmit={identifyFromPhoto} className="mt-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
        <label htmlFor="identify_image">Identify from front image</label>
        <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center">
          <input id="identify_image" name="image" type="file" accept="image/jpeg,image/png,image/webp" className="w-full bg-white" />
          <button
            type="submit"
            disabled={isIdentifying}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isIdentifying ? "Identifying..." : "Auto-fill"}
          </button>
        </div>
        {identificationMessage ? <p className="mt-2 text-sm text-blue-900">{identificationMessage}</p> : null}
        {identificationError ? <p className="mt-2 text-sm text-red-600">{identificationError}</p> : null}
      </form>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="sport">Sport</label>
          <select id="sport" value={values.sport} onChange={(e) => onChange("sport", e.target.value)} className="mt-1 w-full">
            <option value="">Select sport</option>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="year">Year</label>
          <input id="year" value={values.year} onChange={(e) => onChange("year", e.target.value)} className="mt-1 w-full" placeholder="e.g. 1996" />
        </div>

        <div>
          <label htmlFor="brand">Brand</label>
          <input id="brand" value={values.brand} onChange={(e) => onChange("brand", e.target.value)} className="mt-1 w-full" placeholder="e.g. Topps" />
        </div>
        <div>
          <label htmlFor="set">Set</label>
          <input id="set" value={values.set} onChange={(e) => onChange("set", e.target.value)} className="mt-1 w-full" placeholder="e.g. Chrome" />
        </div>

        <div>
          <label htmlFor="cardNumber">Card Number</label>
          <input id="cardNumber" value={values.cardNumber} onChange={(e) => onChange("cardNumber", e.target.value)} className="mt-1 w-full" placeholder="e.g. 150" />
        </div>
        <div>
          <label htmlFor="player">Player</label>
          <input id="player" value={values.player} onChange={(e) => onChange("player", e.target.value)} className="mt-1 w-full" placeholder="e.g. Derek Jeter" />
        </div>

        <div>
          <label htmlFor="team">Team</label>
          <input id="team" value={values.team} onChange={(e) => onChange("team", e.target.value)} className="mt-1 w-full" placeholder="e.g. Yankees" />
        </div>
        <div>
          <label htmlFor="variant">Variant / Parallel</label>
          <input id="variant" value={values.variant} onChange={(e) => onChange("variant", e.target.value)} className="mt-1 w-full" placeholder="e.g. Refractor" />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" value={values.notes} onChange={(e) => onChange("notes", e.target.value)} className="mt-1 w-full" rows={3} placeholder="Anything important about this card..." />
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!isValid}
          className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Upload
        </button>
      </div>
    </section>
  );
}
