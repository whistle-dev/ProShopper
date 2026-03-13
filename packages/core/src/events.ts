import { computeDealScore } from "./analysis/deals.js";
import type {
  BundleAnalysis,
  ListingEvent,
  ListingEventType,
  ListingSnapshot,
  NormalizedListing,
  WatchSpec,
} from "./domain.js";
import { nowIso, stableHash } from "./utils.js";

function createEvent(
  watchId: string,
  listing: NormalizedListing,
  previousListing: NormalizedListing | undefined,
  type: ListingEventType,
  payload: Record<string, unknown>,
): ListingEvent {
  const occurredAt = nowIso();
  return {
    id: crypto.randomUUID(),
    watchId,
    listingId: listing.id,
    type,
    occurredAt,
    fingerprint: stableHash({
      watchId,
      listingId: listing.id,
      type,
      payload,
    }),
    listing,
    ...(previousListing ? { previousListing } : {}),
    payload,
  };
}

export function attachAnalysis(
  listing: NormalizedListing,
  watch: WatchSpec,
  bundleAnalysis?: BundleAnalysis | null,
): NormalizedListing {
  return {
    ...listing,
    ...((bundleAnalysis ?? listing.bundleAnalysis)
      ? { bundleAnalysis: bundleAnalysis ?? listing.bundleAnalysis! }
      : {}),
    dealScore: computeDealScore(listing, watch, bundleAnalysis),
  };
}

export function buildSnapshot(watchId: string, listing: NormalizedListing): ListingSnapshot {
  return {
    id: crypto.randomUUID(),
    watchId,
    listingId: listing.id,
    signature: listing.rawHash,
    observedAt: listing.observedAt,
    payload: listing,
  };
}

export function diffListings(
  watch: WatchSpec,
  previous: ListingSnapshot | undefined,
  next: NormalizedListing,
): ListingEvent[] {
  const previousListing = previous?.payload;
  if (!previousListing) {
    return [
      createEvent(watch.id, next, undefined, next.sourceType === "auction" ? "auction_launch" : "new_listing", {
        price: next.effectivePrice ?? next.price,
        availability: next.availability,
      }),
    ];
  }

  const events: ListingEvent[] = [];
  const previousPrice = previousListing.effectivePrice ?? previousListing.price ?? null;
  const nextPrice = next.effectivePrice ?? next.price ?? null;

  if (previousPrice !== null && nextPrice !== null && previousPrice !== nextPrice) {
    events.push(
      createEvent(watch.id, next, previousListing, nextPrice < previousPrice ? "price_drop" : "price_rise", {
        previousPrice,
        nextPrice,
        delta: nextPrice - previousPrice,
      }),
    );
  }

  if (previousListing.availability !== next.availability) {
    events.push(
      createEvent(watch.id, next, previousListing, "stock_change", {
        previousAvailability: previousListing.availability,
        nextAvailability: next.availability,
      }),
    );
  }

  if ((previousListing.effectivePrice ?? null) !== (next.effectivePrice ?? null)) {
    const hadDemoBadge =
      previousListing.badges.some((badge) => badge.toLowerCase().includes("demo")) ||
      next.badges.some((badge) => badge.toLowerCase().includes("demo"));

    if (hadDemoBadge) {
      events.push(
        createEvent(watch.id, next, previousListing, "effective_demo_discount_change", {
          previousEffectivePrice: previousListing.effectivePrice ?? null,
          nextEffectivePrice: next.effectivePrice ?? null,
        }),
      );
    }
  }

  const previousBid = previousListing.auction?.currentBid ?? null;
  const nextBid = next.auction?.currentBid ?? null;
  if (previousBid !== nextBid && next.sourceType === "auction") {
    events.push(
      createEvent(watch.id, next, previousListing, "auction_price_update", {
        previousBid,
        nextBid,
      }),
    );
  }

  const previousEndsAt = previousListing.auction?.endsAt ?? null;
  const nextEndsAt = next.auction?.endsAt ?? null;
  if (previousEndsAt !== nextEndsAt && next.sourceType === "auction") {
    events.push(
      createEvent(watch.id, next, previousListing, "auction_timer_update", {
        previousEndsAt,
        nextEndsAt,
      }),
    );
  }

  const previousBundleScore = previousListing.bundleAnalysis?.bundleDeltaPct ?? null;
  const nextBundleScore = next.bundleAnalysis?.bundleDeltaPct ?? null;
  if (previousBundleScore !== nextBundleScore && next.sourceType === "bundle") {
    events.push(
      createEvent(watch.id, next, previousListing, "bundle_score_change", {
        previousBundleScore,
        nextBundleScore,
        verdict: next.bundleAnalysis?.verdict ?? "needs_review",
      }),
    );
  }

  return events;
}

export function dedupeEvents(events: ListingEvent[]): ListingEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.fingerprint)) {
      return false;
    }

    seen.add(event.fingerprint);
    return true;
  });
}
