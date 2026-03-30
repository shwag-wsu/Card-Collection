"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../lib/prisma";

const toOptionalNumber = (value: FormDataEntryValue | null) => {
  if (!value) return undefined;
  const parsed = Number(value.toString());
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toOptionalString = (value: FormDataEntryValue | null) => {
  if (!value) return undefined;
  const text = value.toString().trim();
  return text.length ? text : undefined;
};

const toCurrency = (amount: number) => Number(amount.toFixed(2));

export async function createCardAndCollectionItem(formData: FormData) {
  const card = await prisma.card.create({
    data: {
      game: "Sports",
      sport: formData.get("sport")?.toString() || "Unknown",
      set_name: formData.get("set_name")?.toString() || "Unknown Set",
      year: toOptionalNumber(formData.get("year")),
      manufacturer: toOptionalString(formData.get("manufacturer")),
      player_name: toOptionalString(formData.get("player_name")),
      card_number: toOptionalString(formData.get("card_number"))
    }
  });

  await prisma.collectionItem.create({
    data: {
      card_id: card.id,
      quantity: 1,
      ownership_status: "owned"
    }
  });

  revalidatePath("/");
  redirect("/");
}

export async function updateCollectionItem(formData: FormData) {
  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.collectionItem.update({
    where: { id },
    data: {
      quantity: toOptionalNumber(formData.get("quantity")) ?? 1,
      purchase_price: toOptionalNumber(formData.get("purchase_price")),
      ownership_status: formData.get("ownership_status")?.toString() || "owned",
      storage_box: toOptionalString(formData.get("storage_box")),
      notes: toOptionalString(formData.get("notes"))
    }
  });

  revalidatePath("/");
  revalidatePath(`/items/${id}/edit`);
  redirect("/");
}

export async function deleteCollectionItem(formData: FormData) {
  const id = formData.get("id")?.toString();
  if (!id) return;

  await prisma.collectionItem.delete({ where: { id } });

  revalidatePath("/");
  redirect("/");
}

export async function createPriceSnapshot(formData: FormData) {
  const collectionItemId = formData.get("collection_item_id")?.toString();
  if (!collectionItemId) return;

  await prisma.priceSnapshot.create({
    data: {
      collection_item_id: collectionItemId,
      provider: toOptionalString(formData.get("provider")) || "manual",
      currency: toOptionalString(formData.get("currency")) || "USD",
      raw_low: toOptionalNumber(formData.get("raw_low")),
      raw_mid: toOptionalNumber(formData.get("raw_mid")),
      raw_high: toOptionalNumber(formData.get("raw_high")),
      grade_8_value: toOptionalNumber(formData.get("grade_8_value")),
      grade_9_value: toOptionalNumber(formData.get("grade_9_value")),
      grade_10_value: toOptionalNumber(formData.get("grade_10_value")),
      source_note: toOptionalString(formData.get("source_note"))
    }
  });

  const cardId = formData.get("card_id")?.toString();
  if (cardId) {
    revalidatePath(`/cards/${cardId}`);
    redirect(`/cards/${cardId}`);
  }
}

export async function createGradingQuote(formData: FormData) {
  const collectionItemId = formData.get("collection_item_id")?.toString();
  if (!collectionItemId) return;

  const gradingFee = toOptionalNumber(formData.get("grading_fee")) ?? 0;
  const shippingToGrader = toOptionalNumber(formData.get("shipping_to_grader")) ?? 0;
  const returnShipping = toOptionalNumber(formData.get("return_shipping")) ?? 0;
  const insuranceCost = toOptionalNumber(formData.get("insurance_cost")) ?? 0;
  const otherCosts = toOptionalNumber(formData.get("other_costs")) ?? 0;

  await prisma.gradingQuote.create({
    data: {
      collection_item_id: collectionItemId,
      grader: toOptionalString(formData.get("grader")) || "PSA",
      service_level: toOptionalString(formData.get("service_level")) || "Value",
      declared_value: toOptionalNumber(formData.get("declared_value")),
      grading_fee: gradingFee,
      shipping_to_grader: shippingToGrader,
      return_shipping: returnShipping,
      insurance_cost: insuranceCost,
      other_costs: otherCosts,
      total_cost: toCurrency(gradingFee + shippingToGrader + returnShipping + insuranceCost + otherCosts)
    }
  });

  const cardId = formData.get("card_id")?.toString();
  if (cardId) {
    revalidatePath(`/cards/${cardId}`);
    redirect(`/cards/${cardId}`);
  }
}

export async function calculateRoiScenarios(formData: FormData) {
  const collectionItemId = formData.get("collection_item_id")?.toString();
  const cardId = formData.get("card_id")?.toString();
  if (!collectionItemId || !cardId) return;

  const sellingFeePct = toOptionalNumber(formData.get("selling_fee_pct")) ?? 13;

  const [item, snapshot, quote] = await Promise.all([
    prisma.collectionItem.findUnique({ where: { id: collectionItemId } }),
    prisma.priceSnapshot.findFirst({
      where: { collection_item_id: collectionItemId },
      orderBy: { captured_at: "desc" }
    }),
    prisma.gradingQuote.findFirst({
      where: { collection_item_id: collectionItemId },
      orderBy: { created_at: "desc" }
    })
  ]);

  if (!item || !snapshot) {
    revalidatePath(`/cards/${cardId}`);
    redirect(`/cards/${cardId}`);
  }

  const gradingCost = quote ? Number(quote.total_cost) : 0;
  const purchasePrice = item.purchase_price ? Number(item.purchase_price) : null;

  const salePrices = [
    { label: "raw", salePrice: snapshot.raw_mid ? Number(snapshot.raw_mid) : null, includeGrading: false },
    { label: "PSA 8", salePrice: snapshot.grade_8_value ? Number(snapshot.grade_8_value) : null, includeGrading: true },
    { label: "PSA 9", salePrice: snapshot.grade_9_value ? Number(snapshot.grade_9_value) : null, includeGrading: true },
    { label: "PSA 10", salePrice: snapshot.grade_10_value ? Number(snapshot.grade_10_value) : null, includeGrading: true }
  ].filter((scenario) => scenario.salePrice !== null) as {
    label: string;
    salePrice: number;
    includeGrading: boolean;
  }[];

  if (!salePrices.length) {
    revalidatePath(`/cards/${cardId}`);
    redirect(`/cards/${cardId}`);
  }

  const rawSale = salePrices.find((scenario) => scenario.label === "raw")?.salePrice ?? salePrices[0].salePrice;
  const rawSellingFee = toCurrency(rawSale * (sellingFeePct / 100));
  const rawNet = toCurrency(rawSale - rawSellingFee);

  await prisma.roiScenario.deleteMany({ where: { collection_item_id: collectionItemId } });

  await prisma.roiScenario.createMany({
    data: salePrices.map((scenario) => {
      const sellingFeeAmount = toCurrency(scenario.salePrice * (sellingFeePct / 100));
      const scenarioGradingCost = scenario.includeGrading ? gradingCost : 0;
      const netAfterFees = toCurrency(scenario.salePrice - sellingFeeAmount - scenarioGradingCost);

      return {
        collection_item_id: collectionItemId,
        grade_label: scenario.label,
        expected_sale_price: toCurrency(scenario.salePrice),
        grading_cost: toCurrency(scenarioGradingCost),
        selling_fee_pct: toCurrency(sellingFeePct),
        selling_fee_amount: sellingFeeAmount,
        net_after_fees: netAfterFees,
        profit_vs_raw_sale: toCurrency(netAfterFees - rawNet),
        profit_vs_total_cost_basis: purchasePrice === null ? null : toCurrency(netAfterFees - purchasePrice)
      };
    })
  });

  revalidatePath(`/cards/${cardId}`);
  redirect(`/cards/${cardId}`);
}
