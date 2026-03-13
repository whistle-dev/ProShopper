import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ListingEvent,
  ListingSnapshot,
  PurchaseIntent,
  RetailerAccount,
  WatchSpec,
} from "../domain.js";

export const retailerAccounts = pgTable(
  "retailer_accounts",
  {
    id: text("id").primaryKey(),
    retailer: text("retailer").notNull(),
    label: text("label").notNull(),
    status: text("status").notNull(),
    encryptedSessionState: text("encrypted_session_state"),
    sessionMeta: jsonb("session_meta").$type<RetailerAccount["sessionMeta"]>(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("retailer_accounts_retailer_key").on(table.retailer)],
);

export const watches = pgTable(
  "watches",
  {
    id: text("id").primaryKey(),
    retailer: text("retailer").notNull(),
    inputType: text("input_type").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    cadenceMinutes: integer("cadence_minutes"),
    spec: jsonb("spec").$type<WatchSpec>().notNull(),
    notificationPolicy: jsonb("notification_policy").$type<WatchSpec["notificationPolicy"]>().notNull(),
    thresholds: jsonb("thresholds").$type<WatchSpec["thresholds"]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  },
  (table) => [
    index("watches_active_idx").on(table.active),
    index("watches_input_type_idx").on(table.inputType),
  ],
);

export const listingSnapshots = pgTable(
  "listing_snapshots",
  {
    id: text("id").primaryKey(),
    watchId: text("watch_id")
      .notNull()
      .references(() => watches.id, { onDelete: "cascade" }),
    listingId: text("listing_id").notNull(),
    signature: text("signature").notNull(),
    payload: jsonb("payload").$type<ListingSnapshot["payload"]>().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("listing_snapshots_watch_id_idx").on(table.watchId),
    index("listing_snapshots_listing_id_idx").on(table.listingId),
  ],
);

export const listingEvents = pgTable(
  "listing_events",
  {
    id: text("id").primaryKey(),
    watchId: text("watch_id")
      .notNull()
      .references(() => watches.id, { onDelete: "cascade" }),
    listingId: text("listing_id").notNull(),
    type: text("type").notNull(),
    fingerprint: text("fingerprint").notNull(),
    payload: jsonb("payload").$type<ListingEvent>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("listing_events_fingerprint_key").on(table.fingerprint),
    index("listing_events_occurred_at_idx").on(table.occurredAt),
  ],
);

export const purchaseIntents = pgTable(
  "purchase_intents",
  {
    id: text("id").primaryKey(),
    watchId: text("watch_id")
      .notNull()
      .references(() => watches.id, { onDelete: "cascade" }),
    listingId: text("listing_id").notNull(),
    retailer: text("retailer").notNull(),
    listingUrl: text("listing_url").notNull(),
    listingTitle: text("listing_title").notNull(),
    desiredPrice: numeric("desired_price", { precision: 10, scale: 2 }),
    reason: text("reason").notNull(),
    status: text("status").notNull(),
    liveSubmissionAllowed: boolean("live_submission_allowed").notNull().default(false),
    payload: jsonb("payload").$type<PurchaseIntent["payload"]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("purchase_intents_status_idx").on(table.status),
    index("purchase_intents_watch_id_idx").on(table.watchId),
  ],
);

export const schema = {
  retailerAccounts,
  watches,
  listingSnapshots,
  listingEvents,
  purchaseIntents,
};
