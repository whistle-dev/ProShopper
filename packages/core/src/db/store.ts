import { desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  ListingEvent,
  ListingSnapshot,
  PurchaseIntent,
  PurchaseIntentStatus,
  RetailerAccount,
  WatchSpec,
} from "../domain.js";
import { nowIso } from "../utils.js";
import type { Database } from "./client.js";
import { listingEvents, listingSnapshots, purchaseIntents, retailerAccounts, watches } from "./schema.js";

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class DatabaseStore {
  constructor(private readonly db: Database) {}

  async listActiveWatches(): Promise<WatchSpec[]> {
    const rows = await this.db.select().from(watches).where(eq(watches.active, true)).orderBy(desc(watches.updatedAt));
    return rows.map((row) => row.spec);
  }

  async listWatches(): Promise<WatchSpec[]> {
    const rows = await this.db.select().from(watches).orderBy(desc(watches.updatedAt));
    return rows.map((row) => row.spec);
  }

  async getWatchById(id: string): Promise<WatchSpec | null> {
    const row = await this.db.query.watches.findFirst({
      where: eq(watches.id, id),
    });
    return row?.spec ?? null;
  }

  async upsertWatch(watch: WatchSpec): Promise<void> {
    await this.db
      .insert(watches)
      .values({
        id: watch.id,
        retailer: watch.retailer,
        inputType: watch.inputType,
        name: watch.name,
        active: watch.active,
        cadenceMinutes: watch.cadenceMinutes ?? null,
        spec: watch,
        notificationPolicy: watch.notificationPolicy,
        thresholds: watch.thresholds ?? null,
        createdAt: new Date(watch.createdAt),
        updatedAt: new Date(watch.updatedAt),
      })
      .onConflictDoUpdate({
        target: watches.id,
        set: {
          retailer: watch.retailer,
          inputType: watch.inputType,
          name: watch.name,
          active: watch.active,
          cadenceMinutes: watch.cadenceMinutes ?? null,
          spec: watch,
          notificationPolicy: watch.notificationPolicy,
          thresholds: watch.thresholds ?? null,
          updatedAt: new Date(watch.updatedAt),
        },
      });
  }

  async deleteWatch(id: string): Promise<void> {
    await this.db.delete(watches).where(eq(watches.id, id));
  }

  async touchWatchPolled(id: string): Promise<void> {
    await this.db
      .update(watches)
      .set({
        lastPolledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(watches.id, id));
  }

  async getLatestSnapshotsForWatch(watchId: string): Promise<Map<string, ListingSnapshot>> {
    const rows = await this.db
      .select()
      .from(listingSnapshots)
      .where(eq(listingSnapshots.watchId, watchId))
      .orderBy(desc(listingSnapshots.observedAt));

    const map = new Map<string, ListingSnapshot>();
    for (const row of rows) {
      if (map.has(row.listingId)) {
        continue;
      }

      map.set(row.listingId, {
        id: row.id,
        watchId: row.watchId,
        listingId: row.listingId,
        signature: row.signature,
        observedAt: toIso(row.observedAt)!,
        payload: row.payload,
      });
    }

    return map;
  }

  async saveSnapshots(snapshots: ListingSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;

    await this.db.insert(listingSnapshots).values(
      snapshots.map((snapshot) => ({
        id: snapshot.id,
        watchId: snapshot.watchId,
        listingId: snapshot.listingId,
        signature: snapshot.signature,
        payload: snapshot.payload,
        observedAt: new Date(snapshot.observedAt),
      })),
    );
  }

  async appendEvents(events: ListingEvent[]): Promise<ListingEvent[]> {
    if (events.length === 0) {
      return [];
    }

    const inserted = await this.db
      .insert(listingEvents)
      .values(
        events.map((event) => ({
          id: event.id,
          watchId: event.watchId,
          listingId: event.listingId,
          type: event.type,
          fingerprint: event.fingerprint,
          payload: event,
          occurredAt: new Date(event.occurredAt),
        })),
      )
      .onConflictDoNothing({ target: listingEvents.fingerprint })
      .returning();

    return inserted.map((row) => row.payload);
  }

  async listRecentEvents(limit = 100): Promise<ListingEvent[]> {
    const rows = await this.db.select().from(listingEvents).orderBy(desc(listingEvents.occurredAt)).limit(limit);
    return rows.map((row) => row.payload);
  }

  async markEventsNotified(ids: string[]): Promise<void> {
    if (ids.length === 0) {
      return;
    }

    await this.db
      .update(listingEvents)
      .set({
        notifiedAt: new Date(),
      })
      .where(inArray(listingEvents.id, ids));
  }

  async listUnnotifiedEvents(limit = 50): Promise<ListingEvent[]> {
    const rows = await this.db
      .select()
      .from(listingEvents)
      .where(isNull(listingEvents.notifiedAt))
      .orderBy(desc(listingEvents.occurredAt))
      .limit(limit);
    return rows.map((row) => row.payload);
  }

  async getRetailerAccount(retailer: RetailerAccount["retailer"]): Promise<RetailerAccount | null> {
    const row = await this.db.query.retailerAccounts.findFirst({
      where: eq(retailerAccounts.retailer, retailer),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      retailer: row.retailer as RetailerAccount["retailer"],
      label: row.label,
      status: row.status as RetailerAccount["status"],
      ...(row.encryptedSessionState !== null
        ? { encryptedSessionState: row.encryptedSessionState }
        : {}),
      ...(row.sessionMeta ? { sessionMeta: row.sessionMeta } : {}),
      connectedAt: toIso(row.connectedAt),
      lastVerifiedAt: toIso(row.lastVerifiedAt),
      createdAt: toIso(row.createdAt)!,
      updatedAt: toIso(row.updatedAt)!,
    };
  }

  async upsertRetailerAccount(account: RetailerAccount): Promise<void> {
    await this.db
      .insert(retailerAccounts)
      .values({
        id: account.id,
        retailer: account.retailer,
        label: account.label,
        status: account.status,
        encryptedSessionState: account.encryptedSessionState ?? null,
        sessionMeta: account.sessionMeta ?? null,
        connectedAt: account.connectedAt ? new Date(account.connectedAt) : null,
        lastVerifiedAt: account.lastVerifiedAt ? new Date(account.lastVerifiedAt) : null,
        createdAt: new Date(account.createdAt),
        updatedAt: new Date(account.updatedAt),
      })
      .onConflictDoUpdate({
        target: retailerAccounts.retailer,
        set: {
          label: account.label,
          status: account.status,
          encryptedSessionState: account.encryptedSessionState ?? null,
          sessionMeta: account.sessionMeta ?? null,
          connectedAt: account.connectedAt ? new Date(account.connectedAt) : null,
          lastVerifiedAt: account.lastVerifiedAt ? new Date(account.lastVerifiedAt) : null,
          updatedAt: new Date(account.updatedAt),
        },
      });
  }

  async disconnectRetailerAccount(retailer: RetailerAccount["retailer"]): Promise<void> {
    await this.db
      .update(retailerAccounts)
      .set({
        status: "disconnected",
        encryptedSessionState: null,
        sessionMeta: null,
        updatedAt: new Date(),
      })
      .where(eq(retailerAccounts.retailer, retailer));
  }

  async listPurchaseIntents(status?: PurchaseIntentStatus, limit = 50): Promise<PurchaseIntent[]> {
    const baseQuery = this.db.select().from(purchaseIntents);
    const rows = await (status
      ? baseQuery.where(eq(purchaseIntents.status, status))
      : baseQuery)
      .orderBy(desc(purchaseIntents.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      watchId: row.watchId,
      listingId: row.listingId,
      retailer: row.retailer as PurchaseIntent["retailer"],
      listingUrl: row.listingUrl,
      listingTitle: row.listingTitle,
      desiredPrice: row.desiredPrice ? Number(row.desiredPrice) : null,
      reason: row.reason,
      status: row.status as PurchaseIntentStatus,
      liveSubmissionAllowed: row.liveSubmissionAllowed,
      payload: row.payload,
      createdAt: toIso(row.createdAt)!,
      updatedAt: toIso(row.updatedAt)!,
    }));
  }

  async getPurchaseIntent(id: string): Promise<PurchaseIntent | null> {
    const row = await this.db.query.purchaseIntents.findFirst({
      where: eq(purchaseIntents.id, id),
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      watchId: row.watchId,
      listingId: row.listingId,
      retailer: row.retailer as PurchaseIntent["retailer"],
      listingUrl: row.listingUrl,
      listingTitle: row.listingTitle,
      desiredPrice: row.desiredPrice ? Number(row.desiredPrice) : null,
      reason: row.reason,
      status: row.status as PurchaseIntentStatus,
      liveSubmissionAllowed: row.liveSubmissionAllowed,
      payload: row.payload,
      createdAt: toIso(row.createdAt)!,
      updatedAt: toIso(row.updatedAt)!,
    };
  }

  async createPurchaseIntent(intent: PurchaseIntent): Promise<void> {
    await this.db.insert(purchaseIntents).values({
      id: intent.id,
      watchId: intent.watchId,
      listingId: intent.listingId,
      retailer: intent.retailer,
      listingUrl: intent.listingUrl,
      listingTitle: intent.listingTitle,
      desiredPrice: intent.desiredPrice?.toFixed(2) ?? null,
      reason: intent.reason,
      status: intent.status,
      liveSubmissionAllowed: intent.liveSubmissionAllowed,
      payload: intent.payload,
      createdAt: new Date(intent.createdAt),
      updatedAt: new Date(intent.updatedAt),
    });
  }

  async updatePurchaseIntentStatus(id: string, status: PurchaseIntentStatus, payloadPatch?: Record<string, unknown>) {
    const current = await this.getPurchaseIntent(id);
    if (!current) {
      return null;
    }

    const nextPayload = payloadPatch ? { ...current.payload, ...payloadPatch } : current.payload;

    await this.db
      .update(purchaseIntents)
      .set({
        status,
        payload: nextPayload,
        updatedAt: new Date(),
      })
      .where(eq(purchaseIntents.id, id));

    return {
      ...current,
      status,
      payload: nextPayload,
      updatedAt: nowIso(),
    } satisfies PurchaseIntent;
  }

  async createSeedWatchIfEmpty(seedWatch: WatchSpec): Promise<void> {
    const [row] = await this.db.select({ count: sql<number>`count(*)` }).from(watches);
    if (Number(row?.count ?? 0) === 0) {
      await this.upsertWatch(seedWatch);
    }
  }
}
