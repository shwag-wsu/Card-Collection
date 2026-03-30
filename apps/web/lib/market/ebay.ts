const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;
const EBAY_MARKETPLACE_ID = process.env.EBAY_MARKETPLACE_ID || "EBAY_US";

let cachedToken: { value: string; expiresAt: number } | null = null;

type CardLookupInput = {
  year?: number;
  brand?: string;
  set?: string;
  player?: string;
  cardNumber?: string;
  variant?: string;
};

type EbayItem = {
  itemId?: string;
  title?: string;
  itemWebUrl?: string;
  price?: { value?: string; currency?: string };
  buyingOptions?: string[];
};

export type MarketComp = {
  grade: string;
  source: "eBay";
  avgPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
  sampleSize: number;
  currency: string;
  listings: Array<{ title: string; price: number; url?: string }>;
};

export async function getEbayAccessToken() {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    throw new Error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET");
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`eBay token request failed (${response.status})`);
  }

  const json = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + Math.max(120, json.expires_in - 120) * 1000 };
  return json.access_token;
}

function buildQuery(input: CardLookupInput, grade: string) {
  return [input.year, input.brand, input.set, input.player, input.cardNumber ? `#${input.cardNumber}` : null, input.variant, grade]
    .filter(Boolean)
    .join(" ");
}

const JUNK_TERMS = ["reprint", "lot", "custom", "proxy"];

function isLikelyJunkTitle(title: string) {
  const lower = title.toLowerCase();
  return JUNK_TERMS.some((term) => lower.includes(term));
}

function hasProbablePlayerMatch(title: string, player?: string) {
  if (!player) return true;
  const parts = player.toLowerCase().split(/\s+/).filter((part) => part.length > 1);
  const lower = title.toLowerCase();
  return parts.every((part) => lower.includes(part));
}

function hasCardNumberMatch(title: string, cardNumber?: string) {
  if (!cardNumber) return true;
  const lower = title.toLowerCase();
  return lower.includes(`#${cardNumber.toLowerCase()}`) || lower.includes(` ${cardNumber.toLowerCase()} `);
}

export function normalizeListingPrice(item: EbayItem) {
  const parsed = Number(item.price?.value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return {
    title: item.title || "",
    price: parsed,
    currency: item.price?.currency || "USD",
    url: item.itemWebUrl
  };
}

export function summarizeCompPrices(grade: string, listings: ReturnType<typeof normalizeListingPrice>[]): MarketComp {
  const valid = listings.filter((listing): listing is NonNullable<typeof listing> => Boolean(listing));
  const prices = valid.map((listing) => listing.price).sort((a, b) => a - b);

  if (prices.length === 0) {
    return {
      grade,
      source: "eBay",
      avgPrice: null,
      lowPrice: null,
      highPrice: null,
      sampleSize: 0,
      currency: "USD",
      listings: []
    };
  }

  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;

  return {
    grade,
    source: "eBay",
    avgPrice: Number(avg.toFixed(2)),
    lowPrice: prices[0] ?? null,
    highPrice: prices[prices.length - 1] ?? null,
    sampleSize: prices.length,
    currency: valid[0]?.currency || "USD",
    listings: valid.slice(0, 8).map(({ title, price, url }) => ({ title, price, url }))
  };
}

export async function searchEbayListings(input: CardLookupInput, grade: "PSA 8" | "PSA 9" | "PSA 10") {
  const token = await getEbayAccessToken();
  const q = buildQuery(input, grade);

  const searchUrl = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  searchUrl.searchParams.set("q", q);
  searchUrl.searchParams.set("limit", "30");
  searchUrl.searchParams.set("filter", "buyingOptions:{FIXED_PRICE|AUCTION}");

  const response = await fetch(searchUrl, {
    headers: {
      authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`eBay browse search failed (${response.status})`);
  }

  const json = (await response.json()) as { itemSummaries?: EbayItem[] };
  const cleanListings = (json.itemSummaries || [])
    .filter((item) => item.title && !isLikelyJunkTitle(item.title))
    .filter((item) => hasProbablePlayerMatch(item.title || "", input.player))
    .filter((item) => hasCardNumberMatch(item.title || "", input.cardNumber))
    .map(normalizeListingPrice);

  return summarizeCompPrices(grade, cleanListings);
}

export async function lookupEbayPsaComps(input: CardLookupInput) {
  const grades: Array<"PSA 8" | "PSA 9" | "PSA 10"> = ["PSA 8", "PSA 9", "PSA 10"];

  const results = await Promise.all(
    grades.map(async (grade) => {
      try {
        return await searchEbayListings(input, grade);
      } catch {
        // We return sparse data on errors instead of inventing price averages.
        return {
          grade,
          source: "eBay" as const,
          avgPrice: null,
          lowPrice: null,
          highPrice: null,
          sampleSize: 0,
          currency: "USD",
          listings: []
        };
      }
    })
  );

  return results;
}
