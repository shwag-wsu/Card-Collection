"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  itemId: string;
};

export function ImageUploadForm({ itemId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const form = event.currentTarget;
    const formData = new FormData(form);

    const hasFront = (formData.get("front_image") as File | null)?.size;
    const hasBack = (formData.get("back_image") as File | null)?.size;

    if (!hasFront && !hasBack) {
      setError("Select at least one image file.");
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/collection-items/${itemId}/images`, {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Upload failed.");
        return;
      }

      setSuccess(payload.analysis ? "Images uploaded and AI pre-grade estimate generated." : "Images uploaded successfully.");
      form.reset();
      router.refresh();
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="text-lg font-medium">Card Images</h2>
      <p className="text-xs text-slate-500">Accepted: JPG, PNG, WEBP up to 10MB each.</p>

      <div>
        <label htmlFor="front_image">Front image</label>
        <input id="front_image" name="front_image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full" />
      </div>

      <div>
        <label htmlFor="back_image">Back image</label>
        <input id="back_image" name="back_image" type="file" accept="image/jpeg,image/png,image/webp" className="mt-1 w-full" />
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {success ? <p className="text-sm text-green-700">{success}</p> : null}

      <button disabled={isPending} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {isPending ? "Uploading..." : "Upload images"}
      </button>
    </form>
  );
}
