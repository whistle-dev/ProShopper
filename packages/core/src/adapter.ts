import type {
  BundleAnalysis,
  NormalizedListing,
  PurchaseIntent,
  RetailerAccount,
  RetailerId,
  WatchSpec,
} from "./domain.js";

export interface SearchSpec {
  watch: WatchSpec;
  limit?: number;
}

export interface FeedSpec {
  retailer: RetailerId;
  sourceType: NormalizedListing["sourceType"];
  url: string;
  keywords?: string[];
  limit?: number;
}

export interface EffectivePriceResult {
  effectivePrice: number | null;
  observedAt: string;
  method: "page" | "cart";
  notes: string[];
}

export interface PurchasePreparationResult {
  intentId: string;
  status: "prepared" | "submitted" | "blocked";
  confirmationUrl?: string;
  liveSubmitted: boolean;
  notes: string[];
}

export interface RetailerAdapter {
  retailer: RetailerId;
  search(spec: SearchSpec): Promise<NormalizedListing[]>;
  fetchListing(url: string): Promise<NormalizedListing | null>;
  pollFeed(feedSpec: FeedSpec): Promise<NormalizedListing[]>;
  verifyEffectivePrice(
    listing: NormalizedListing,
    account?: RetailerAccount | null,
  ): Promise<EffectivePriceResult>;
  analyzeBundle(listing: NormalizedListing): Promise<BundleAnalysis | null>;
  preparePurchase(
    intent: PurchaseIntent,
    account: RetailerAccount,
  ): Promise<PurchasePreparationResult>;
}
