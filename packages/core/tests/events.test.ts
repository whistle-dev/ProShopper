import { describe, expect, it } from "vitest";
import {
  attachAnalysis,
  buildSnapshot,
  dedupeEvents,
  diffListings,
  shouldCreatePurchaseIntent,
  shouldNotifyEvent,
  type AuctionFeedWatchSpec,
  type KeywordWatchSpec,
  type NormalizedListing,
} from "../src/index.js";

function createWatch(overrides: Partial<KeywordWatchSpec> = {}): KeywordWatchSpec {
  return {
    id: "watch-1",
    retailer: "proshop",
    name: "Demo GPU watch",
    inputType: "keyword",
    query: "RTX 5080",
    active: true,
    notificationPolicy: {
      pushToDiscord: true,
      minDealScore: 60,
    },
    thresholds: {
      minDealScore: 40,
      maxPrice: 6500,
      autoCreatePurchaseIntent: true,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createListing(overrides: Partial<NormalizedListing> = {}): NormalizedListing {
  return {
    id: "listing-1",
    retailer: "proshop",
    sourceType: "demo",
    url: "https://www.proshop.dk/example",
    title: "ASUS GeForce RTX 5080 Demo",
    normalizedModel: "asus geforce rtx 5080 demo",
    price: 6999,
    effectivePrice: 6299,
    originalPrice: 7699,
    currency: "DKK",
    availability: "in_stock",
    badges: ["Demo"],
    observedAt: new Date().toISOString(),
    rawHash: "listing-1",
    ...overrides,
  };
}

describe("event diffing", () => {
  it("creates auction launch events for first-seen auction listings", () => {
    const watch: AuctionFeedWatchSpec = {
      id: "auction-watch",
      retailer: "proshop",
      name: "Auction watch",
      inputType: "auction_feed",
      active: true,
      feedUrl: "https://www.proshop.dk/Auctions",
      notificationPolicy: { pushToDiscord: true, minDealScore: 20 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const listing = createListing({ sourceType: "auction", auction: { currentBid: 3000 } });
    const events = diffListings(watch, undefined, listing);
    expect(events[0]?.type).toBe("auction_launch");
  });

  it("detects price and stock changes", () => {
    const watch = createWatch();
    const previous = buildSnapshot(watch.id, createListing({ effectivePrice: 6599, availability: "sold_out" }));
    const next = createListing({ effectivePrice: 6199, availability: "in_stock" });
    const events = diffListings(watch, previous, next);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["price_drop", "stock_change", "effective_demo_discount_change"]),
    );
  });

  it("deduplicates repeated events", () => {
    const watch = createWatch();
    const next = createListing();
    const event = diffListings(watch, undefined, next)[0]!;
    expect(dedupeEvents([event, event])).toHaveLength(1);
  });
});

describe("deal gating", () => {
  it("creates purchase intents only when thresholds are met", () => {
    const watch = createWatch();
    const listing = attachAnalysis(createListing(), watch);
    expect(shouldCreatePurchaseIntent(listing, watch)).toBe(true);
  });

  it("filters Discord notifications using min score", () => {
    const watch = createWatch();
    const listing = attachAnalysis(createListing({ effectivePrice: 7200 }), watch);
    const event = diffListings(watch, undefined, listing)[0]!;
    expect(shouldNotifyEvent(event, watch)).toBe(true);
  });
});
