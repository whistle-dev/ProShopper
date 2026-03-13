export type RetailerId = "proshop";

export type WatchInputType =
  | "product"
  | "keyword"
  | "category"
  | "auction_feed"
  | "bundle_feed";

export type ListingSourceType =
  | "hardware"
  | "search"
  | "demo"
  | "auction"
  | "bundle"
  | "product";

export type AvailabilityStatus =
  | "in_stock"
  | "low_stock"
  | "preorder"
  | "backorder"
  | "sold_out"
  | "unknown";

export type AccountStatus = "connected" | "expired" | "disconnected";

export type PurchaseIntentStatus =
  | "pending_approval"
  | "approved"
  | "processing"
  | "prepared"
  | "submitted"
  | "rejected"
  | "failed";

export type ListingEventType =
  | "listing_seen"
  | "new_listing"
  | "price_drop"
  | "price_rise"
  | "stock_change"
  | "effective_demo_discount_change"
  | "auction_launch"
  | "auction_price_update"
  | "auction_timer_update"
  | "bundle_score_change";

export interface WatchThresholds {
  maxPrice?: number;
  minDiscountPct?: number;
  minDealScore?: number;
  minBundleScore?: number;
  autoCreatePurchaseIntent?: boolean;
}

export interface NotificationPolicy {
  pushToDiscord: boolean;
  dashboardOnly?: boolean;
  includePriceRises?: boolean;
  includeStockChanges?: boolean;
  minDealScore?: number;
}

export interface WatchFilters {
  includeKeywords?: string[];
  excludeKeywords?: string[];
  includeBrands?: string[];
  excludeBrands?: string[];
  minPrice?: number;
  maxPrice?: number;
}

export interface WatchBase {
  id: string;
  retailer: RetailerId;
  name: string;
  inputType: WatchInputType;
  active: boolean;
  cadenceMinutes?: number;
  filters?: WatchFilters;
  thresholds?: WatchThresholds;
  notificationPolicy: NotificationPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface ProductWatchSpec extends WatchBase {
  inputType: "product";
  productUrl: string;
}

export interface KeywordWatchSpec extends WatchBase {
  inputType: "keyword";
  query: string;
  feedUrls?: string[];
  sourceTypes?: ListingSourceType[];
}

export interface CategoryWatchSpec extends WatchBase {
  inputType: "category";
  feedUrl: string;
  sourceType?: ListingSourceType;
}

export interface AuctionFeedWatchSpec extends WatchBase {
  inputType: "auction_feed";
  feedUrl?: string;
}

export interface BundleFeedWatchSpec extends WatchBase {
  inputType: "bundle_feed";
  feedUrl?: string;
}

export type WatchSpec =
  | ProductWatchSpec
  | KeywordWatchSpec
  | CategoryWatchSpec
  | AuctionFeedWatchSpec
  | BundleFeedWatchSpec;

export interface DealScore {
  overall: number;
  valueSignal: number;
  urgencySignal: number;
  qualitySignal: number;
  reasons: string[];
}

export interface BundleComponent {
  category: string;
  title: string;
  normalizedTitle: string;
  brand?: string;
  ean?: string;
  mpn?: string;
  price?: number | null;
  listingUrl?: string;
}

export interface BundleAnalysis {
  sourceListingId: string;
  sumOfParts: number | null;
  bundleDeltaPct: number | null;
  qualityFlags: string[];
  confidence: number;
  verdict: "strong_buy" | "fair" | "avoid" | "needs_review";
  matchedComponents: Array<
    BundleComponent & {
      matchedListingId?: string;
      matchedListingUrl?: string;
      matchedPrice?: number | null;
    }
  >;
}

export interface AuctionData {
  currentBid?: number | null;
  bidCount?: number | null;
  endsAt?: string | null;
}

export interface NormalizedListing {
  id: string;
  retailer: RetailerId;
  sourceType: ListingSourceType;
  url: string;
  title: string;
  normalizedModel: string;
  brand?: string;
  retailerSku?: string;
  ean?: string;
  mpn?: string;
  price?: number | null;
  effectivePrice?: number | null;
  originalPrice?: number | null;
  currency: "DKK";
  imageUrl?: string;
  availability: AvailabilityStatus;
  availabilityText?: string;
  badges: string[];
  components?: BundleComponent[];
  qualityFlags?: string[];
  dealScore?: DealScore;
  bundleAnalysis?: BundleAnalysis;
  auction?: AuctionData;
  observedAt: string;
  rawHash: string;
}

export interface ListingSnapshot {
  id: string;
  watchId: string;
  listingId: string;
  signature: string;
  observedAt: string;
  payload: NormalizedListing;
}

export interface ListingEvent {
  id: string;
  watchId: string;
  listingId: string;
  type: ListingEventType;
  occurredAt: string;
  fingerprint: string;
  listing: NormalizedListing;
  previousListing?: NormalizedListing;
  payload: Record<string, unknown>;
  notifiedAt?: string | null;
}

export interface PurchaseIntent {
  id: string;
  watchId: string;
  listingId: string;
  retailer: RetailerId;
  listingUrl: string;
  listingTitle: string;
  desiredPrice?: number | null;
  reason: string;
  status: PurchaseIntentStatus;
  liveSubmissionAllowed: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface RetailerAccount {
  id: string;
  retailer: RetailerId;
  label: string;
  status: AccountStatus;
  encryptedSessionState?: string | null;
  sessionMeta?: Record<string, unknown>;
  connectedAt?: string | null;
  lastVerifiedAt?: string | null;
  updatedAt: string;
  createdAt: string;
}
