import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseProshopFeed, parseProshopProductPage } from "../src/index.js";

function readFixture(name: string) {
  return readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
}

describe("Proshop parsers", () => {
  it("parses hardware listing cards", () => {
    const listings = parseProshopFeed(readFixture("hardware-feed.html"), "hardware");
    expect(listings).toHaveLength(2);
    expect(listings[0]).toMatchObject({
      title: "MSI GeForce RTX 5080 Ventus 16GB",
      brand: "MSI",
      availability: "in_stock",
      price: 7499,
      originalPrice: 7999,
    });
  });

  it("parses demo badges and pricing", () => {
    const listing = parseProshopFeed(readFixture("demo-feed.html"), "demo")[0]!;
    expect(listing.badges).toContain("20% EKSTRA DEMO RABAT");
    expect(listing.price).toBe(5499);
    expect(listing.availability).toBe("in_stock");
  });

  it("parses auction metadata", () => {
    const listing = parseProshopFeed(readFixture("auctions-feed.html"), "auction")[0]!;
    expect(listing.auction?.currentBid).toBe(2899);
    expect(listing.auction?.endsAt).toBe("2026-03-20T11:00:00Z");
  });

  it("parses DUTZO product detail components", () => {
    const listing = parseProshopProductPage(
      readFixture("bundle-product.html"),
      "https://www.proshop.dk/DUTZO-stationaer-gaming-PC/example",
    );
    expect(listing).not.toBeNull();
    expect(listing?.sourceType).toBe("bundle");
    expect(listing?.components).toHaveLength(8);
    expect(listing?.components?.map((component) => component.category)).toContain("PSU");
    expect(listing?.ean).toBe("5700000000001");
  });
});
