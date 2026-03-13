import {
  DatabaseStore,
  createDatabaseConnection,
  nowIso,
  type CategoryWatchSpec,
  type KeywordWatchSpec,
  type ListingEvent,
  type PurchaseIntent,
  type RetailerAccount,
  type WatchSpec,
} from "@proshopper/core/web";

declare global {
  // eslint-disable-next-line no-var
  var __proshopperStore: DatabaseStore | undefined;
  // eslint-disable-next-line no-var
  var __proshopperDbCleanup: (() => Promise<void>) | undefined;
}

export function getStore(): DatabaseStore | null {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }

  if (globalThis.__proshopperStore) {
    return globalThis.__proshopperStore;
  }

  const { db, client } = createDatabaseConnection(databaseUrl);
  globalThis.__proshopperStore = new DatabaseStore(db);
  globalThis.__proshopperDbCleanup = () => client.end();
  return globalThis.__proshopperStore;
}

export interface DashboardData {
  mode: "live" | "demo";
  account: RetailerAccount | null;
  watches: WatchSpec[];
  events: ListingEvent[];
  purchaseIntents: PurchaseIntent[];
  generatedAt: string;
}

function createDemoDashboardData(): DashboardData {
  const timestamp = nowIso();
  const watchGpu: KeywordWatchSpec = {
    id: crypto.randomUUID(),
    retailer: "proshop",
    name: "GPU and launch scout",
    inputType: "keyword",
    query: "RTX 5080",
    active: true,
    cadenceMinutes: 10,
    notificationPolicy: {
      pushToDiscord: true,
      minDealScore: 65,
    },
    thresholds: {
      minDealScore: 65,
      maxPrice: 6999,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const watchDemo: CategoryWatchSpec = {
    id: crypto.randomUUID(),
    retailer: "proshop",
    name: "Demo hardware sweep",
    inputType: "category",
    active: true,
    cadenceMinutes: 30,
    notificationPolicy: {
      pushToDiscord: true,
      minDealScore: 60,
    },
    sourceType: "demo",
    feedUrl: "https://www.proshop.dk/Demo-produkter",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const eventTime = timestamp;
  const sharedListing = {
    id: "demo-listing-1",
    retailer: "proshop" as const,
    sourceType: "demo" as const,
    url: "https://www.proshop.dk/Demo-produkter/example",
    title: "MSI GeForce RTX 5080 Ventus Demo",
    normalizedModel: "msi geforce rtx 5080 ventus",
    brand: "MSI",
    price: 7499,
    effectivePrice: 5999,
    originalPrice: 7999,
    currency: "DKK" as const,
    availability: "in_stock" as const,
    badges: ["20% EKSTRA DEMO RABAT", "Demo"],
    dealScore: {
      overall: 84,
      valueSignal: 70,
      urgencySignal: 30,
      qualitySignal: 80,
      reasons: ["Price is 25.0% below reference.", "Demo badge detected."],
    },
    observedAt: eventTime,
    rawHash: "demo",
  };

  return {
    mode: "demo",
    account: {
      id: "demo-account",
      retailer: "proshop",
      label: "Primary Proshop account",
      status: "connected",
      connectedAt: eventTime,
      lastVerifiedAt: eventTime,
      createdAt: eventTime,
      updatedAt: eventTime,
    },
    watches: [watchGpu, watchDemo],
    events: [
      {
        id: "evt-1",
        watchId: watchDemo.id,
        listingId: sharedListing.id,
        type: "effective_demo_discount_change",
        occurredAt: eventTime,
        fingerprint: "evt-1",
        listing: sharedListing,
        payload: {
          previousEffectivePrice: 6499,
          nextEffectivePrice: 5999,
        },
      },
      {
        id: "evt-2",
        watchId: watchGpu.id,
        listingId: "bundle-1",
        type: "bundle_score_change",
        occurredAt: eventTime,
        fingerprint: "evt-2",
        listing: {
          id: "bundle-1",
          retailer: "proshop",
          sourceType: "bundle",
          url: "https://www.proshop.dk/DUTZO/example",
          title: "DUTZO Esport Firestorm RTX 5080",
          normalizedModel: "dutzo esport firestorm rtx 5080",
          price: 18499,
          originalPrice: 19499,
          effectivePrice: 18499,
          currency: "DKK",
          availability: "in_stock",
          badges: ["DUTZO"],
          components: [
            { category: "CPU", title: "AMD Ryzen 7 9800X3D", normalizedTitle: "amd ryzen 7 9800x3d" },
            { category: "GPU", title: "MSI GeForce RTX 5080 Ventus", normalizedTitle: "msi geforce rtx 5080 ventus" },
            { category: "PSU", title: "Unknown 750W Bronze PSU", normalizedTitle: "unknown 750w bronze psu" },
          ],
          bundleAnalysis: {
            sourceListingId: "bundle-1",
            sumOfParts: 17749,
            bundleDeltaPct: 4.22,
            qualityFlags: ["Weak or unknown PSU quality"],
            confidence: 0.72,
            verdict: "avoid",
            matchedComponents: [],
          },
          dealScore: {
            overall: 58,
            valueSignal: 24,
            urgencySignal: 20,
            qualitySignal: 52,
            reasons: ["Bundle delta versus parts: 4.2%.", "Weak or unknown PSU quality"],
          },
          observedAt: eventTime,
          rawHash: "bundle-1",
        },
        payload: {
          previousBundleScore: -2.1,
          nextBundleScore: 4.22,
          verdict: "avoid",
        },
      },
    ],
    purchaseIntents: [
      {
        id: "intent-1",
        watchId: watchDemo.id,
        listingId: sharedListing.id,
        retailer: "proshop",
        listingUrl: sharedListing.url,
        listingTitle: sharedListing.title,
        desiredPrice: 5999,
        reason: "Price is 25.0% below reference.",
        status: "pending_approval",
        liveSubmissionAllowed: false,
        payload: {
          sourceType: "demo",
          dealScore: 84,
          pickup: "Proshop København",
        },
        createdAt: eventTime,
        updatedAt: eventTime,
      },
    ],
    generatedAt: eventTime,
  };
}

export async function getDashboardData(): Promise<DashboardData> {
  const store = getStore();
  if (!store) {
    return createDemoDashboardData();
  }

  try {
    const [account, watches, events, purchaseIntents] = await Promise.all([
      store.getRetailerAccount("proshop"),
      store.listWatches(),
      store.listRecentEvents(100),
      store.listPurchaseIntents(undefined, 25),
    ]);

    return {
      mode: "live",
      account,
      watches,
      events,
      purchaseIntents,
      generatedAt: nowIso(),
    };
  } catch {
    return createDemoDashboardData();
  }
}
