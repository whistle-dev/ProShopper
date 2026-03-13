import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type {
  AvailabilityStatus,
  BundleComponent,
  ListingSourceType,
  NormalizedListing,
} from "../domain.js";
import { compact, normalizeText, normalizeWhitespace, parsePriceText, stableHash, unique } from "../utils.js";

const PROSHOP_HOST = "https://www.proshop.dk";

function absolutizeUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${PROSHOP_HOST}${url}`;
  return `${PROSHOP_HOST}/${url}`;
}

function inferAvailability(text: string): AvailabilityStatus {
  const normalized = normalizeText(text);
  if (!normalized) return "unknown";
  if (normalized.includes("på lager")) return "in_stock";
  if (normalized.includes("få på lager")) return "low_stock";
  if (normalized.includes("forudbestil") || normalized.includes("preorder")) return "preorder";
  if (normalized.includes("restordre") || normalized.includes("backorder")) return "backorder";
  if (normalized.includes("udsolgt") || normalized.includes("ikke på lager")) return "sold_out";
  return "unknown";
}

function makeListingId(url: string, sku: string | undefined, sourceType: ListingSourceType): string {
  return stableHash({ retailer: "proshop", url, sku, sourceType }).slice(0, 24);
}

function normalizedModel(title: string): string {
  return normalizeText(title)
    .replace(/\b(demo|auktion|auction|dutzo)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractText($root: CheerioAPI, selectors: string[]): string {
  for (const selector of selectors) {
    const text = normalizeWhitespace($root(selector).first().text());
    if (text) return text;
  }
  return "";
}

function extractCardText($card: Cheerio<any>, selectors: string[]): string {
  for (const selector of selectors) {
    const text = normalizeWhitespace($card.find(selector).first().text());
    if (text) return text;
  }
  return "";
}

function extractCardListings(html: string, sourceType: ListingSourceType): NormalizedListing[] {
  const $ = load(html);
  const seen = new Set<string>();
  const cards = $(
    [
      "[data-product-id]",
      "[data-productid]",
      "[data-item-id]",
      ".site-product",
      ".product-list-item",
      ".list-product",
      "article",
    ].join(","),
  );

  const observedAt = new Date().toISOString();
  const listings: NormalizedListing[] = [];

  cards.each((_, node) => {
    const card = $(node);
    const href = card.find("a[href]").first().attr("href");
    const url = absolutizeUrl(href);
    const title = extractCardText(card, [
      "[data-product-title]",
      ".site-product-title",
      ".product-title",
      "h2",
      "h3",
      "[itemprop='name']",
    ]);

    if (!url || !title || seen.has(url)) {
      return;
    }

    seen.add(url);
    const price =
      parsePriceText(card.attr("data-price")) ||
      parsePriceText(
        extractCardText(card, [
          "[itemprop='price']",
          ".site-currency-lg",
          ".price",
          ".sales-price",
          ".auction-price",
        ]),
      );
    const originalPrice = parsePriceText(
      extractCardText(card, [".before-price", ".list-price", ".oldprice", ".site-price-before"]),
    );
    const badges = unique(
      compact(
        card
          .find(".badge, .campaign, .label, .sticker, span[class*='badge']")
          .toArray()
          .map((element) => normalizeWhitespace($(element).text())),
      ),
    );
    const availabilityText = extractCardText(card, [".stock", ".stock-status", ".delivery", ".inventory"]);
    const sku =
      card.attr("data-product-id") ??
      card.attr("data-productid") ??
      card.attr("data-item-id") ??
      undefined;
    const imageUrl = absolutizeUrl(card.find("img").first().attr("src") ?? card.find("img").first().attr("data-src"));
    const auctionPrice =
      sourceType === "auction" ? price : parsePriceText(card.find("[data-current-bid]").attr("data-current-bid"));
    const auctionEndsAt =
      card.find("[data-endtime]").attr("data-endtime") ??
      card.find("[data-countdown-end]").attr("data-countdown-end") ??
      card.find("time").attr("datetime") ??
      null;

    const listing: NormalizedListing = {
      id: makeListingId(url, sku, sourceType),
      retailer: "proshop",
      sourceType,
      url,
      title,
      normalizedModel: normalizedModel(title),
      ...(normalizeWhitespace(card.find(".brand, [data-brand]").first().text())
        ? { brand: normalizeWhitespace(card.find(".brand, [data-brand]").first().text()) }
        : {}),
      ...(sku ? { retailerSku: sku } : {}),
      price,
      originalPrice,
      currency: "DKK",
      ...(imageUrl ? { imageUrl } : {}),
      availability: inferAvailability(availabilityText),
      ...(availabilityText ? { availabilityText } : {}),
      badges,
      observedAt,
      rawHash: stableHash({
        sourceType,
        url,
        title,
        price,
        originalPrice,
        availabilityText,
        badges,
        auctionPrice,
        auctionEndsAt,
      }),
    };

    if (sourceType === "auction") {
      listing.auction = {
        currentBid: auctionPrice,
        endsAt: auctionEndsAt,
      };
    }

    listings.push(listing);
  });

  return listings;
}

function collectSpecificationPairs($: CheerioAPI): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];

  $("table tr").each((_, row) => {
    const cells = $(row).find("th, td");
    if (cells.length < 2) return;
    const key = normalizeWhitespace($(cells[0]).text());
    const value = normalizeWhitespace($(cells[1]).text());
    if (key && value) pairs.push({ key, value });
  });

  $("dl").each((_, dl) => {
    const terms = $(dl).find("dt");
    terms.each((index, term) => {
      const key = normalizeWhitespace($(term).text());
      const value = normalizeWhitespace($(term).next("dd").text());
      if (key && value) pairs.push({ key, value });
      if (index > 20) return false;
    });
  });

  return pairs;
}

function componentCategoryFromKey(key: string): string | null {
  const normalized = normalizeText(key);
  if (normalized.includes("processor") || normalized.includes("cpu")) return "CPU";
  if (normalized.includes("grafik") || normalized.includes("graphics") || normalized.includes("gpu")) return "GPU";
  if (normalized.includes("ram") || normalized.includes("memory")) return "RAM";
  if (normalized.includes("ssd") || normalized.includes("storage")) return "SSD";
  if (normalized.includes("motherboard")) return "Motherboard";
  if (normalized.includes("power") || normalized.includes("psu")) return "PSU";
  if (normalized.includes("cooler") || normalized.includes("køler")) return "Cooler";
  if (normalized.includes("case") || normalized.includes("kabinet")) return "Case";
  return null;
}

function extractBundleComponents($: CheerioAPI): BundleComponent[] {
  const components: BundleComponent[] = [];
  const specPairs = collectSpecificationPairs($);
  for (const pair of specPairs) {
    const category = componentCategoryFromKey(pair.key);
    if (!category) continue;
    components.push({
      category,
      title: pair.value,
      normalizedTitle: normalizeText(pair.value),
    });
  }

  return components;
}

function parseJsonLdProduct($: CheerioAPI) {
  const scripts = $("script[type='application/ld+json']").toArray();
  for (const script of scripts) {
    const content = $(script).html();
    if (!content) continue;

    try {
      const parsed = JSON.parse(content) as Record<string, unknown> | Array<Record<string, unknown>>;
      const objects = Array.isArray(parsed) ? parsed : [parsed];
      const product = objects.find((entry) => entry["@type"] === "Product");
      if (product) {
        return product;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function parseProshopFeed(html: string, sourceType: ListingSourceType): NormalizedListing[] {
  return extractCardListings(html, sourceType);
}

export function parseProshopProductPage(html: string, url: string): NormalizedListing | null {
  const $ = load(html);
  const jsonLd = parseJsonLdProduct($);
  const title =
    normalizeWhitespace(
      extractText($, ["h1", "[itemprop='name']", "meta[property='og:title']"])
        .replace(/^content=/, ""),
    ) ||
    (typeof jsonLd?.name === "string" ? jsonLd.name : "");
  if (!title) {
    return null;
  }

  const sku =
    $("meta[property='product:retailer_item_id']").attr("content") ??
    $("meta[name='product:retailer_item_id']").attr("content") ??
    undefined;
  const brandText =
    normalizeWhitespace($(".brand, [itemprop='brand']").first().text()) ||
    (typeof jsonLd?.brand === "string"
      ? jsonLd.brand
      : typeof jsonLd?.brand === "object" && jsonLd?.brand && "name" in jsonLd.brand
        ? String(jsonLd.brand.name)
        : "");
  const imageUrl =
    absolutizeUrl($("meta[property='og:image']").attr("content")) ??
    absolutizeUrl($("img").first().attr("src")) ??
    undefined;
  const pagePrice =
    parsePriceText($("[itemprop='price']").attr("content")) ||
    parsePriceText(extractText($, [".site-currency-lg", ".price", ".sales-price"]));
  const originalPrice = parsePriceText(extractText($, [".before-price", ".list-price", ".oldprice"]));
  const availabilityText = extractText($, [".stock", ".availability", ".delivery", ".inventory"]);
  const badges = unique(
    compact(
      $(".badge, .campaign, .label, .sticker, span[class*='badge']")
        .toArray()
        .map((element) => normalizeWhitespace($(element).text())),
    ),
  );
  const specPairs = collectSpecificationPairs($);
  const components = extractBundleComponents($);
  const ean = specPairs.find((pair) => normalizeText(pair.key).includes("ean"))?.value;
  const mpn = specPairs.find((pair) => normalizeText(pair.key).includes("model"))?.value;
  const observedAt = new Date().toISOString();

  return {
    id: makeListingId(url, sku, "product"),
    retailer: "proshop",
    sourceType: url.includes("/DUTZO-") ? "bundle" : "product",
    url,
    title,
    normalizedModel: normalizedModel(title),
    ...(brandText ? { brand: brandText } : {}),
    ...(sku ? { retailerSku: sku } : {}),
    ...(ean ? { ean } : {}),
    ...(mpn ? { mpn } : {}),
    price: pagePrice,
    originalPrice,
    currency: "DKK",
    ...(imageUrl ? { imageUrl } : {}),
    availability: inferAvailability(availabilityText),
    ...(availabilityText ? { availabilityText } : {}),
    badges,
    ...(components.length > 0 ? { components } : {}),
    observedAt,
    rawHash: stableHash({
      url,
      title,
      pagePrice,
      originalPrice,
      availabilityText,
      badges,
      components,
      ean,
      mpn,
    }),
  };
}
