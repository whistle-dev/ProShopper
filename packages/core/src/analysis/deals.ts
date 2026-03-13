import type {
  BundleAnalysis,
  DealScore,
  ListingEvent,
  ListingEventType,
  NormalizedListing,
  WatchSpec,
} from "../domain.js";

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function computeDealScore(
  listing: NormalizedListing,
  watch: WatchSpec,
  bundleAnalysis?: BundleAnalysis | null,
): DealScore {
  const originalPrice = listing.originalPrice ?? listing.price ?? null;
  const actualPrice = listing.effectivePrice ?? listing.price ?? null;
  const discountPct =
    originalPrice && actualPrice ? ((originalPrice - actualPrice) / originalPrice) * 100 : 0;

  const valueSignal = clamp(discountPct * 2);
  const urgencySignal = clamp(
    listing.availability === "in_stock"
      ? 20
      : listing.availability === "low_stock"
        ? 35
        : listing.sourceType === "auction"
          ? 45
          : 10,
  );
  const qualitySignal = clamp(
    bundleAnalysis
      ? 60 -
          bundleAnalysis.qualityFlags.length * 15 -
          Math.max(0, (bundleAnalysis.bundleDeltaPct ?? 0) / 2)
      : 60,
  );

  const reasons: string[] = [];
  if (discountPct >= 10) reasons.push(`Price is ${discountPct.toFixed(1)}% below reference.`);
  if (listing.badges.some((badge) => badge.toLowerCase().includes("demo"))) reasons.push("Demo badge detected.");
  if (listing.sourceType === "auction") reasons.push("Auction listing needs close monitoring.");
  if (bundleAnalysis?.bundleDeltaPct !== null && bundleAnalysis?.bundleDeltaPct !== undefined) {
    reasons.push(`Bundle delta versus parts: ${bundleAnalysis.bundleDeltaPct.toFixed(1)}%.`);
  }
  if (bundleAnalysis?.qualityFlags.length) reasons.push(...bundleAnalysis.qualityFlags);
  if (watch.thresholds?.maxPrice && actualPrice && actualPrice <= watch.thresholds.maxPrice) {
    reasons.push("Matches your max-price threshold.");
  }

  const overall = clamp(Math.round(valueSignal * 0.45 + urgencySignal * 0.2 + qualitySignal * 0.35));

  return {
    overall,
    valueSignal,
    urgencySignal,
    qualitySignal,
    reasons,
  };
}

export function shouldCreatePurchaseIntent(listing: NormalizedListing, watch: WatchSpec): boolean {
  if (!watch.thresholds?.autoCreatePurchaseIntent) {
    return false;
  }

  const actualPrice = listing.effectivePrice ?? listing.price ?? null;
  const withinPrice = watch.thresholds.maxPrice ? actualPrice !== null && actualPrice <= watch.thresholds.maxPrice : true;
  const bundleOkay = watch.thresholds.minBundleScore
    ? (listing.dealScore?.overall ?? 0) >= watch.thresholds.minBundleScore
    : true;
  const dealOkay = watch.thresholds.minDealScore
    ? (listing.dealScore?.overall ?? 0) >= watch.thresholds.minDealScore
    : true;

  return withinPrice && bundleOkay && dealOkay;
}

export function shouldNotifyEvent(event: ListingEvent, watch: WatchSpec): boolean {
  const policy = watch.notificationPolicy;

  if (policy.dashboardOnly) {
    return false;
  }

  if (!policy.pushToDiscord) {
    return false;
  }

  if (event.type === "price_rise" && !policy.includePriceRises) {
    return false;
  }

  if (event.type === "stock_change" && !policy.includeStockChanges) {
    return false;
  }

  const score = event.listing.dealScore?.overall ?? 0;
  const minScore = policy.minDealScore ?? watch.thresholds?.minDealScore ?? 0;

  return score >= minScore || event.type === "new_listing" || event.type === "auction_launch";
}

export function getEventPriority(type: ListingEventType): "high" | "medium" | "low" {
  if (type === "price_drop" || type === "auction_launch" || type === "effective_demo_discount_change") {
    return "high";
  }

  if (type === "bundle_score_change" || type === "stock_change" || type === "auction_price_update") {
    return "medium";
  }

  return "low";
}
