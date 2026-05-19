const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_CARD_IDENTIFICATION_MODEL = process.env.OPENAI_CARD_IDENTIFICATION_MODEL || "gpt-4.1-mini";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 15000);
const OPENAI_MAX_RETRIES = Number(process.env.OPENAI_MAX_RETRIES || 2);

export type CardIdentificationResult = {
  isSportsCard: boolean;
  confidence: number;
  reason: string;
  fields: {
    sport: string | null;
    year: number | null;
    brand: string | null;
    set: string | null;
    cardNumber: string | null;
    player: string | null;
    team: string | null;
    variant: string | null;
  };
};

export type CardIdentificationResponse =
  | { ok: true; result: CardIdentificationResult }
  | { ok: false; error: string };

const cardIdentificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["isSportsCard", "confidence", "reason", "fields"],
  properties: {
    isSportsCard: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
    fields: {
      type: "object",
      additionalProperties: false,
      required: ["sport", "year", "brand", "set", "cardNumber", "player", "team", "variant"],
      properties: {
        sport: { type: ["string", "null"] },
        year: { type: ["number", "null"] },
        brand: { type: ["string", "null"] },
        set: { type: ["string", "null"] },
        cardNumber: { type: ["string", "null"] },
        player: { type: ["string", "null"] },
        team: { type: ["string", "null"] },
        variant: { type: ["string", "null"] }
      }
    }
  }
} as const;

function withTimeoutSignal(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeYear(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const year = Math.trunc(value);
  return year >= 1800 && year <= 2200 ? year : null;
}

function validateCardIdentificationResult(value: unknown): value is CardIdentificationResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.isSportsCard !== "boolean") return false;
  if (typeof candidate.confidence !== "number" || candidate.confidence < 0 || candidate.confidence > 1) return false;
  if (typeof candidate.reason !== "string") return false;
  if (!candidate.fields || typeof candidate.fields !== "object") return false;

  const fields = candidate.fields as Record<string, unknown>;
  const stringKeys = ["sport", "brand", "set", "cardNumber", "player", "team", "variant"] as const;
  return (
    stringKeys.every((key) => fields[key] === null || typeof fields[key] === "string") &&
    (fields.year === null || typeof fields.year === "number")
  );
}

function normalizeResult(result: CardIdentificationResult): CardIdentificationResult {
  return {
    isSportsCard: result.isSportsCard,
    confidence: Math.max(0, Math.min(1, Number(result.confidence || 0))),
    reason: result.reason.trim() || "Visual card identification completed.",
    fields: {
      sport: normalizeNullableString(result.fields.sport),
      year: normalizeYear(result.fields.year),
      brand: normalizeNullableString(result.fields.brand),
      set: normalizeNullableString(result.fields.set),
      cardNumber: normalizeNullableString(result.fields.cardNumber),
      player: normalizeNullableString(result.fields.player),
      team: normalizeNullableString(result.fields.team),
      variant: normalizeNullableString(result.fields.variant)
    }
  };
}

async function imageFileToDataUrl(file: File) {
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${bytes.toString("base64")}`;
}

export async function identifySportsCardFromImage(file: File): Promise<CardIdentificationResponse> {
  if (!OPENAI_API_KEY) {
    return { ok: false, error: "OPENAI_API_KEY is not configured, so card image identification is unavailable." };
  }

  const imageUrl = await imageFileToDataUrl(file);
  const prompt = `Identify whether this image shows a real sports trading card and extract visible card metadata.
Return JSON only with this exact shape:
{
  "isSportsCard": boolean,
  "confidence": number,
  "reason": string,
  "fields": {
    "sport": string | null,
    "year": number | null,
    "brand": string | null,
    "set": string | null,
    "cardNumber": string | null,
    "player": string | null,
    "team": string | null,
    "variant": string | null
  }
}
Rules:
- isSportsCard must be true only for a sports trading card or a clear photo/scan of one.
- If the image is a Pokemon, Magic, entertainment, document, person, logo, package, or unrelated object, set isSportsCard=false.
- Extract only details visible on the card. Do not guess from memory unless printed card text makes it clear.
- For brand, use manufacturers such as Topps, Bowman, Panini, Donruss, Fleer, Upper Deck, Score, or Leaf when visible.
- For set, use the printed/common set description visible from the card, such as "Topps Baseball" or "Topps Traded".
- For player, return the athlete name exactly as visible when possible.
- For cardNumber, include prefixes or suffixes if printed.
- confidence must reflect both sports-card validation and metadata certainty.`;

  const content = [
    { type: "input_text", text: prompt },
    { type: "input_image", image_url: imageUrl }
  ];

  let attempt = 0;
  while (attempt <= OPENAI_MAX_RETRIES) {
    attempt += 1;
    const { signal, clear } = withTimeoutSignal(OPENAI_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: OPENAI_CARD_IDENTIFICATION_MODEL,
          input: [{ role: "user", content }],
          text: {
            format: {
              type: "json_schema",
              name: "card_identification",
              strict: true,
              schema: cardIdentificationJsonSchema
            }
          }
        }),
        cache: "no-store",
        signal
      });
      clear();

      if (!response.ok) {
        if (attempt <= OPENAI_MAX_RETRIES) continue;
        return { ok: false, error: `Card identification failed with status ${response.status}.` };
      }

      const data = (await response.json()) as { output_text?: string };
      if (!data.output_text) return { ok: false, error: "Card identification returned no structured output." };

      const parsed = JSON.parse(data.output_text) as unknown;
      if (!validateCardIdentificationResult(parsed)) {
        return { ok: false, error: "Card identification returned an unexpected response shape." };
      }

      return { ok: true, result: normalizeResult(parsed) };
    } catch (error) {
      clear();
      if (attempt > OPENAI_MAX_RETRIES) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Card identification request failed."
        };
      }
    }
  }

  return { ok: false, error: "Card identification request failed." };
}
