import type { CardDetailsInput } from "./CardWizard";

type Props = {
  values: CardDetailsInput;
  onChange: (key: keyof CardDetailsInput, value: string) => void;
  onNext: () => void;
};

const sports = ["Baseball", "Basketball", "Hockey"];

export function CardDetailsStep({ values, onChange, onNext }: Props) {
  const requiredFields: (keyof CardDetailsInput)[] = ["sport", "year", "brand", "cardNumber", "player"];
  const isValid = requiredFields.every((field) => values[field].trim().length > 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Step 1 · Card Details</h2>
      <p className="mt-1 text-sm text-slate-500">Capture the core details before uploading images.</p>

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
