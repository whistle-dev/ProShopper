import { Queue, Worker } from "bullmq";
import {
  PROSHOP_FEEDS,
  ProshopAdapter,
  buildSnapshot,
  DatabaseStore,
  attachAnalysis,
  createDatabaseConnection,
  dedupeEvents,
  diffListings,
  getEventPriority,
  nowIso,
  shouldCreatePurchaseIntent,
  shouldNotifyEvent,
  type ListingEvent,
  type NormalizedListing,
  type PurchaseIntent,
  type WatchSpec,
  withRetry,
} from "@proshopper/core";
import type { WorkerEnv } from "./env.js";

type QueueName = "sync" | "poll-watch" | "notify" | "purchase";

interface WorkerRuntime {
  queues: Record<QueueName, Queue>;
  workers: Worker[];
  shutdown: () => Promise<void>;
}

const SYNC_JOB_ID = "sync-system";
const APPROVED_PURCHASES_JOB_ID = "sync-approved-purchases";

function getCadenceMinutes(watch: WatchSpec): number {
  if (watch.cadenceMinutes) {
    return watch.cadenceMinutes;
  }

  switch (watch.inputType) {
    case "product":
      return 5;
    case "keyword":
    case "category":
      return 10;
    case "auction_feed":
      return 2;
    case "bundle_feed":
      return 10;
  }
}

function createBullConnection(redisUrl: string) {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(parsed.pathname && parsed.pathname !== "/" ? { db: Number(parsed.pathname.slice(1)) || 0 } : {}),
    maxRetriesPerRequest: null as null,
  };
}

async function collectListingsForWatch(adapter: ProshopAdapter, watch: WatchSpec): Promise<NormalizedListing[]> {
  switch (watch.inputType) {
    case "product": {
      const listing = await adapter.fetchListing(watch.productUrl);
      return listing ? [listing] : [];
    }
    case "keyword":
      return adapter.search({ watch, limit: 120 });
    case "category":
      return adapter.pollFeed({
        retailer: watch.retailer,
        sourceType: watch.sourceType ?? "hardware",
        url: watch.feedUrl,
      });
    case "auction_feed":
      return adapter.pollFeed({
        retailer: watch.retailer,
        sourceType: "auction",
        url: watch.feedUrl ?? PROSHOP_FEEDS.auctions,
      });
    case "bundle_feed":
      return adapter.pollFeed({
        retailer: watch.retailer,
        sourceType: "bundle",
        url: watch.feedUrl ?? PROSHOP_FEEDS.bundles,
      });
  }
}

async function enrichListing(
  adapter: ProshopAdapter,
  watch: WatchSpec,
  listing: NormalizedListing,
): Promise<NormalizedListing> {
  let nextListing = listing;

  if (listing.badges.some((badge) => badge.toLowerCase().includes("demo"))) {
    const effective = await adapter.verifyEffectivePrice(listing);
    nextListing = {
      ...nextListing,
      effectivePrice: effective.effectivePrice,
      rawHash: `${nextListing.rawHash}:${effective.effectivePrice ?? "none"}`,
    };
  }

  if (listing.sourceType === "bundle" || listing.components?.length) {
    const analysis = await adapter.analyzeBundle(nextListing);
    nextListing = attachAnalysis(nextListing, watch, analysis);
  } else {
    nextListing = attachAnalysis(nextListing, watch);
  }

  return nextListing;
}

function buildPurchaseIntent(watch: WatchSpec, listing: NormalizedListing): PurchaseIntent {
  return {
    id: crypto.randomUUID(),
    watchId: watch.id,
    listingId: listing.id,
    retailer: listing.retailer,
    listingUrl: listing.url,
    listingTitle: listing.title,
    desiredPrice: listing.effectivePrice ?? listing.price ?? null,
    reason: listing.dealScore?.reasons[0] ?? "Matched watch thresholds.",
    status: "pending_approval",
    liveSubmissionAllowed: false,
    payload: {
      sourceType: listing.sourceType,
      price: listing.effectivePrice ?? listing.price ?? null,
      dealScore: listing.dealScore?.overall ?? 0,
    },
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function renderDiscordMessage(event: ListingEvent, appBaseUrl: string) {
  const score = event.listing.dealScore?.overall ?? 0;
  const priority = getEventPriority(event.type);
  const price = event.listing.effectivePrice ?? event.listing.price ?? null;
  const actionUrl = `${appBaseUrl}/?focus=${event.listingId}`;

  return {
    username: "Proshopper",
    embeds: [
      {
        title: event.listing.title,
        url: event.listing.url,
        color: priority === "high" ? 0xff6a3d : priority === "medium" ? 0xf2b705 : 0x7a8ea8,
        description: `${event.type.replaceAll("_", " ")} on ${event.listing.sourceType}.`,
        fields: [
          { name: "Price", value: price ? `${price.toFixed(2)} DKK` : "Unknown", inline: true },
          { name: "Deal Score", value: `${score}/100`, inline: true },
          { name: "Availability", value: event.listing.availability, inline: true },
        ],
        footer: {
          text: "Dashboard stores all events even when Discord is filtered.",
        },
        timestamp: event.occurredAt,
      },
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "Open Dashboard",
            url: actionUrl,
          },
        ],
      },
    ],
  };
}

async function postDiscordWebhook(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with ${response.status}`);
  }
}

async function synchronizeWatchJobs(store: DatabaseStore, queues: WorkerRuntime["queues"]) {
  const watches = await store.listActiveWatches();
  const pollQueue = queues["poll-watch"];
  for (const watch of watches) {
    await pollQueue.add(
      "poll-watch",
      { watchId: watch.id },
      {
        jobId: `poll-watch:${watch.id}`,
        repeat: {
          every: getCadenceMinutes(watch) * 60_000,
        },
      },
    );
  }

  const approved = await store.listPurchaseIntents("approved", 50);
  for (const intent of approved) {
    await queues.purchase.add(
      "purchase",
      { purchaseIntentId: intent.id },
      {
        jobId: `purchase:${intent.id}`,
      },
    );
  }
}

export async function createWorkerRuntime(env: WorkerEnv): Promise<WorkerRuntime> {
  const connection = createBullConnection(env.REDIS_URL);
  const { db, client } = createDatabaseConnection(env.DATABASE_URL);
  const store = new DatabaseStore(db);
  const adapter = new ProshopAdapter();
  const queues: WorkerRuntime["queues"] = {
    sync: new Queue("sync", { connection }),
    "poll-watch": new Queue("poll-watch", { connection }),
    notify: new Queue("notify", { connection }),
    purchase: new Queue("purchase", { connection }),
  };

  await queues.sync.add(
    "sync",
    {},
    {
      jobId: SYNC_JOB_ID,
      repeat: {
        every: 60_000,
      },
    },
  );
  await queues.sync.add(
    "sync-approved-purchases",
    {},
    {
      jobId: APPROVED_PURCHASES_JOB_ID,
      repeat: {
        every: 60_000,
      },
    },
  );

  const syncWorker = new Worker(
    "sync",
    async () => {
      await synchronizeWatchJobs(store, queues);
    },
    { connection },
  );

  const pollWorker = new Worker(
    "poll-watch",
    async (job) => {
      const watch = await store.getWatchById(String(job.data.watchId));
      if (!watch || !watch.active) {
        return;
      }

      const listings = await collectListingsForWatch(adapter, watch);
      const previousSnapshots = await store.getLatestSnapshotsForWatch(watch.id);
      const snapshots = [];
      const allEvents: ListingEvent[] = [];

      for (const listing of listings) {
        const enriched = await enrichListing(adapter, watch, listing);
        const previous = previousSnapshots.get(enriched.id);
        const nextEvents = diffListings(watch, previous, enriched);
        snapshots.push(buildSnapshot(watch.id, enriched));
        allEvents.push(...nextEvents);

        if (shouldCreatePurchaseIntent(enriched, watch)) {
          await store.createPurchaseIntent(buildPurchaseIntent(watch, enriched));
        }
      }

      const insertedEvents = await store.appendEvents(dedupeEvents(allEvents));
      await store.saveSnapshots(snapshots);
      await store.touchWatchPolled(watch.id);

      for (const event of insertedEvents) {
        if (shouldNotifyEvent(event, watch)) {
          await queues.notify.add("notify", { eventId: event.id }, { jobId: `notify:${event.id}` });
        }
      }
    },
    { connection, concurrency: 2 },
  );

  const notifyWorker = new Worker(
    "notify",
    async (job) => {
      if (!env.DISCORD_WEBHOOK_URL) {
        return;
      }

      const recent = await store.listUnnotifiedEvents(100);
      const target = recent.find((event) => event.id === String(job.data.eventId));
      if (!target) {
        return;
      }

      await withRetry(
        () => postDiscordWebhook(env.DISCORD_WEBHOOK_URL!, renderDiscordMessage(target, env.APP_BASE_URL)),
        {
          attempts: 4,
          initialDelayMs: 500,
        },
      );
      await store.markEventsNotified([target.id]);
    },
    { connection, concurrency: 3 },
  );

  const purchaseWorker = new Worker(
    "purchase",
    async (job) => {
      const intent = await store.getPurchaseIntent(String(job.data.purchaseIntentId));
      if (!intent || intent.status !== "approved") {
        return;
      }

      const account = await store.getRetailerAccount(intent.retailer);
      if (!account) {
        await store.updatePurchaseIntentStatus(intent.id, "failed", {
          failureReason: "No connected retailer account.",
        });
        return;
      }

      await store.updatePurchaseIntentStatus(intent.id, "processing");
      try {
        const result = await adapter.preparePurchase(intent, account);
        await store.updatePurchaseIntentStatus(
          intent.id,
          result.status === "submitted" ? "submitted" : "prepared",
          {
            lastPreparation: result,
          },
        );
      } catch (error) {
        await store.updatePurchaseIntentStatus(intent.id, "failed", {
          failureReason: error instanceof Error ? error.message : "Unknown purchase preparation failure",
        });
      }
    },
    { connection, concurrency: 1 },
  );

  return {
    queues,
    workers: [syncWorker, pollWorker, notifyWorker, purchaseWorker],
    shutdown: async () => {
      await Promise.all([
        ...Object.values(queues).map((queue) => queue.close()),
        ...[syncWorker, pollWorker, notifyWorker, purchaseWorker].map((worker) => worker.close()),
      ]);
      await client.end();
    },
  };
}
