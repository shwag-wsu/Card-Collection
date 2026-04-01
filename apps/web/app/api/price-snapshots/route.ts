import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

type PriceSnapshotPayload = {
  collection_item_id?: string;
  provider?: string;
  currency?: string;
  raw_low?: number | null;
  raw_mid?: number | null;
  raw_high?: number | null;
  grade_8_value?: number | null;
  grade_9_value?: number | null;
  grade_10_value?: number | null;
  source_note?: string | null;
  captured_at?: string;
};

const toOptionalNumber = (value: unknown): number | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  return text.length ? text : undefined;
};

export async function POST(request: Request) {
  const payload = (await request.json()) as PriceSnapshotPayload;

  if (!payload.collection_item_id) {
    return NextResponse.json({ error: "collection_item_id is required" }, { status: 400 });
  }

  const exists = await prisma.collectionItem.findUnique({ where: { id: payload.collection_item_id }, select: { id: true } });
  if (!exists) {
    return NextResponse.json({ error: "collection_item_id was not found" }, { status: 404 });
  }

  const data = {
    collection_item_id: payload.collection_item_id,
    provider: toOptionalString(payload.provider) || "manual",
    currency: toOptionalString(payload.currency) || "USD",
    raw_low: toOptionalNumber(payload.raw_low),
    raw_mid: toOptionalNumber(payload.raw_mid),
    raw_high: toOptionalNumber(payload.raw_high),
    grade_8_value: toOptionalNumber(payload.grade_8_value),
    grade_9_value: toOptionalNumber(payload.grade_9_value),
    grade_10_value: toOptionalNumber(payload.grade_10_value),
    source_note: toOptionalString(payload.source_note) || null,
    captured_at: payload.captured_at ? new Date(payload.captured_at) : undefined
  };

  if (payload.captured_at && Number.isNaN((data.captured_at as Date).getTime())) {
    return NextResponse.json({ error: "captured_at must be a valid ISO-8601 datetime" }, { status: 400 });
  }

  const created = await prisma.priceSnapshot.create({ data });
  return NextResponse.json(created, { status: 201 });
}
