import type { FeedSpec, RetailerAdapter, SearchSpec } from "../adapter.js";
import { analyzeBundleAgainstParts } from "../analysis/bundle.js";
import type {
  BundleAnalysis,
  NormalizedListing,
  PurchaseIntent,
  RetailerAccount,
} from "../domain.js";
import { normalizeText } from "../utils.js";
import { parseProshopFeed, parseProshopProductPage } from "./parsers.js";
import { verifyProshopDemoEffectivePrice } from "./demo.js";
import { prepareProshopPurchase } from "./purchase.js";

export const PROSHOP_FEEDS = {
  hardware: "https://www.proshop.dk/Hardware",
  demo: "https://www.proshop.dk/Demo-produkter",
  auctions: "https://www.proshop.dk/Auctions",
  bundles: "https://www.proshop.dk/DUTZO-stationaer-gaming-PC",
} as const;

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "da-DK,da;q=0.9,en;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

function inferSourceTypeFromUrl(url: string): FeedSpec["sourceType"] {
  if (url.includes("/Demo-produkter")) return "demo";
  if (url.includes("/Auctions")) return "auction";
  if (url.includes("/DUTZO-")) return "bundle";
  return "hardware";
}

function matchKeywords(listing: NormalizedListing, terms: string[]): boolean {
  if (terms.length === 0) {
    return true;
  }

  const haystack = normalizeText(
    [
      listing.title,
      listing.brand,
      listing.badges.join(" "),
      listing.components?.map((component) => component.title).join(" "),
    ]
      .filter(Boolean)
      .join(" "),
  );

  return terms.every((term) => haystack.includes(normalizeText(term)));
}

export class ProshopAdapter implements RetailerAdapter {
  retailer = "proshop" as const;

  async search(spec: SearchSpec): Promise<NormalizedListing[]> {
    const sourceTypes = spec.watch.inputType === "keyword" ? spec.watch.sourceTypes : undefined;
    const feedUrls =
      spec.watch.inputType === "keyword" && spec.watch.feedUrls?.length
        ? spec.watch.feedUrls
        : [
            PROSHOP_FEEDS.hardware,
            PROSHOP_FEEDS.demo,
            PROSHOP_FEEDS.auctions,
            PROSHOP_FEEDS.bundles,
          ];
    const queryTerms = spec.watch.inputType === "keyword" ? spec.watch.query.split(/\s+/) : [];

    const listings = await Promise.all(
      feedUrls.map((url) =>
        this.pollFeed({
          retailer: "proshop",
          sourceType: inferSourceTypeFromUrl(url),
          url,
        }),
      ),
    ).then((groups) => groups.flat());

    return listings
      .filter((listing) => (sourceTypes?.length ? sourceTypes.includes(listing.sourceType) : true))
      .filter((listing) => matchKeywords(listing, queryTerms))
      .slice(0, spec.limit ?? 50);
  }

  async fetchListing(url: string): Promise<NormalizedListing | null> {
    const html = await fetchHtml(url);
    return parseProshopProductPage(html, url);
  }

  async pollFeed(feedSpec: FeedSpec): Promise<NormalizedListing[]> {
    const html = await fetchHtml(feedSpec.url);
    const listings = parseProshopFeed(html, feedSpec.sourceType);

    if (feedSpec.sourceType === "bundle") {
      const enriched = await Promise.all(
        listings.slice(0, feedSpec.limit ?? listings.length).map(async (listing) => {
          const detail = await this.fetchListing(listing.url);
          return detail ?? listing;
        }),
      );
      return enriched;
    }

    return listings
      .filter((listing) => matchKeywords(listing, feedSpec.keywords ?? []))
      .slice(0, feedSpec.limit ?? listings.length);
  }

  async verifyEffectivePrice(
    listing: NormalizedListing,
    account?: RetailerAccount | null,
  ) {
    return verifyProshopDemoEffectivePrice(listing, account);
  }

  async analyzeBundle(listing: NormalizedListing): Promise<BundleAnalysis | null> {
    if (listing.sourceType !== "bundle" && !listing.components?.length) {
      return null;
    }

    const hardwareListings = await this.pollFeed({
      retailer: "proshop",
      sourceType: "hardware",
      url: PROSHOP_FEEDS.hardware,
      limit: 250,
    });

    return analyzeBundleAgainstParts(listing, hardwareListings);
  }

  async preparePurchase(intent: PurchaseIntent, account: RetailerAccount) {
    return prepareProshopPurchase(intent, account);
  }
}
