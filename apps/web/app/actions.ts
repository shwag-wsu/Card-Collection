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

export async function createCardAndCollectionItem(formData: FormData) {
  const card = await prisma.card.create({
    data: {
      game: formData.get("game")?.toString() || "Unknown",
      set_name: formData.get("set_name")?.toString() || "Unknown Set",
      year: toOptionalNumber(formData.get("year")),
      manufacturer: toOptionalString(formData.get("manufacturer")),
      player_name: toOptionalString(formData.get("player_name")),
      character_name: toOptionalString(formData.get("character_name")),
      card_number: toOptionalString(formData.get("card_number"))
    }
  });

  await prisma.collectionItem.create({
    data: {
      card_id: card.id,
      quantity: toOptionalNumber(formData.get("quantity")) ?? 1,
      purchase_price: toOptionalNumber(formData.get("purchase_price")),
      ownership_status: formData.get("ownership_status")?.toString() || "owned",
      notes: toOptionalString(formData.get("item_notes"))
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
