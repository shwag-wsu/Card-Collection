import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    openapi: "3.0.3",
    info: {
      title: "Card Collection API",
      version: "1.0.0",
      description: "API for card creation, image analysis, and manual pricing snapshots."
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/price-snapshots": {
        post: {
          summary: "Create a price snapshot",
          description: "Uploads pricing information using the same fields as the Manual Price Snapshot form.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["collection_item_id"],
                  properties: {
                    collection_item_id: { type: "string", format: "uuid" },
                    provider: { type: "string", example: "manual" },
                    currency: { type: "string", example: "USD" },
                    raw_low: { type: "number", nullable: true },
                    raw_mid: { type: "number", nullable: true },
                    raw_high: { type: "number", nullable: true },
                    grade_8_value: { type: "number", nullable: true },
                    grade_9_value: { type: "number", nullable: true },
                    grade_10_value: { type: "number", nullable: true },
                    source_note: { type: "string", nullable: true },
                    captured_at: { type: "string", format: "date-time" }
                  }
                }
              }
            }
          },
          responses: {
            "201": {
              description: "Price snapshot created"
            },
            "400": { description: "Bad request" },
            "404": { description: "Collection item not found" }
          }
        }
      },
      "/api/cards/create-with-images": {
        post: {
          summary: "Create card with uploaded images and run AI pre-grade",
          responses: {
            "200": { description: "Card created" },
            "400": { description: "Validation error" },
            "502": { description: "AI grading unavailable" }
          }
        }
      }
    }
  });
}
