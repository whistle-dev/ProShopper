import { nowIso, type WatchSpec, type WatchThresholds } from "@proshopper/core/web";
import { z } from "zod";

const watchRequestSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  inputType: z.enum(["product", "keyword", "category", "auction_feed", "bundle_feed"]),
  target: z.string().min(1),
  cadenceMinutes: z.number().int().positive().max(240).optional(),
  minDealScore: z.number().min(0).max(100).optional(),
  maxPrice: z.number().positive().optional(),
  autoCreatePurchaseIntent: z.boolean().optional(),
  pushToDiscord: z.boolean().default(true),
});

export type WatchRequest = z.infer<typeof watchRequestSchema>;

function getDefaultCadenceMinutes(inputType: WatchSpec["inputType"]) {
  switch (inputType) {
    case "product":
      return 5;
    case "keyword":
    case "category":
    case "bundle_feed":
      return 10;
    case "auction_feed":
      return 2;
  }
}

export function parseWatchRequest(payload: unknown): WatchRequest {
  return watchRequestSchema.parse(payload);
}

export function buildWatchSpec(payload: WatchRequest, existing?: WatchSpec | null): WatchSpec {
  const timestamp = nowIso();
  const thresholds: WatchThresholds = {
    autoCreatePurchaseIntent:
      payload.autoCreatePurchaseIntent ?? existing?.thresholds?.autoCreatePurchaseIntent ?? false,
  };

  if (existing?.thresholds?.minDiscountPct !== undefined) {
    thresholds.minDiscountPct = existing.thresholds.minDiscountPct;
  }

  if (existing?.thresholds?.minBundleScore !== undefined) {
    thresholds.minBundleScore = existing.thresholds.minBundleScore;
  }

  const minDealScore = payload.minDealScore ?? existing?.thresholds?.minDealScore;
  if (minDealScore !== undefined) {
    thresholds.minDealScore = minDealScore;
  }

  const maxPrice = payload.maxPrice ?? existing?.thresholds?.maxPrice;
  if (maxPrice !== undefined) {
    thresholds.maxPrice = maxPrice;
  }
  const base = {
    id: existing?.id ?? payload.id ?? crypto.randomUUID(),
    retailer: "proshop" as const,
    name: payload.name,
    inputType: payload.inputType,
    active: existing?.active ?? true,
    cadenceMinutes: payload.cadenceMinutes ?? existing?.cadenceMinutes ?? getDefaultCadenceMinutes(payload.inputType),
    thresholds,
    notificationPolicy: {
      pushToDiscord: payload.pushToDiscord,
      minDealScore: payload.minDealScore ?? existing?.notificationPolicy.minDealScore ?? 0,
    },
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  switch (payload.inputType) {
    case "product":
      return {
        ...base,
        inputType: "product",
        productUrl: payload.target,
      } satisfies WatchSpec;
    case "keyword":
      return {
        ...base,
        inputType: "keyword",
        query: payload.target,
      } satisfies WatchSpec;
    case "category":
      return {
        ...base,
        inputType: "category",
        feedUrl: payload.target,
        sourceType: payload.target.includes("Demo-produkter") ? "demo" : "hardware",
      } satisfies WatchSpec;
    case "auction_feed":
      return {
        ...base,
        inputType: "auction_feed",
        feedUrl: payload.target,
      } satisfies WatchSpec;
    case "bundle_feed":
      return {
        ...base,
        inputType: "bundle_feed",
        feedUrl: payload.target,
      } satisfies WatchSpec;
  }
}
