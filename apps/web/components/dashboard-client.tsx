"use client";

import { startTransition, useDeferredValue, useState } from "react";
import type { ListingEvent, PurchaseIntent, WatchSpec } from "@proshopper/core/web";
import type { DashboardData } from "../lib/store";

interface WatchDraft {
  name: string;
  inputType: WatchSpec["inputType"];
  target: string;
  cadenceMinutes: number;
  minDealScore: number;
  maxPrice: string;
  autoCreatePurchaseIntent: boolean;
  pushToDiscord: boolean;
}

const initialDraft: WatchDraft = {
  name: "",
  inputType: "keyword",
  target: "",
  cadenceMinutes: 10,
  minDealScore: 60,
  maxPrice: "",
  autoCreatePurchaseIntent: false,
  pushToDiscord: true,
};

function formatPrice(value: number | null | undefined) {
  if (typeof value !== "number") return "Unknown";
  return `${value.toFixed(0)} DKK`;
}

function eventLabel(type: ListingEvent["type"]) {
  return type.replaceAll("_", " ");
}

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<WatchDraft>(initialDraft);
  const [busy, setBusy] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const query = deferredSearch.trim().toLowerCase();
  const filteredEvents = !query
    ? data.events
    : data.events.filter((event) =>
        `${event.type} ${event.listing.title} ${event.listing.brand ?? ""}`.toLowerCase().includes(query),
      );
  const summary = {
    pending: data.purchaseIntents.filter((intent) => intent.status === "pending_approval").length,
    hotDeals: data.events.filter((event) => (event.listing.dealScore?.overall ?? 0) >= 75).length,
    liveWatches: data.watches.filter((watch) => watch.active).length,
  };

  async function refreshDashboard() {
    setBusy(true);
    try {
      const [eventsResponse, watchesResponse] = await Promise.all([
        fetch("/api/events"),
        fetch("/api/watches"),
      ]);
      const [events, watches] = await Promise.all([eventsResponse.json(), watchesResponse.json()]);
      setData((current) => ({
        ...current,
        events,
        watches,
      }));
    } finally {
      setBusy(false);
    }
  }

  async function submitWatch() {
    setBusy(true);
    try {
      const response = await fetch("/api/watches", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...draft,
          maxPrice: draft.maxPrice ? Number(draft.maxPrice) : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save watch.");
      }

      const savedWatch = (await response.json()) as WatchSpec;
      setData((current) => ({
        ...current,
        mode: current.mode === "demo" ? "live" : current.mode,
        watches: [savedWatch, ...current.watches.filter((watch) => watch.id !== savedWatch.id)],
      }));
      setDraft(initialDraft);
    } finally {
      setBusy(false);
    }
  }

  async function updateIntent(intent: PurchaseIntent, action: "approve" | "reject") {
    setBusy(true);
    try {
      const response = await fetch(`/api/purchase-intents/${intent.id}/${action}`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Failed to ${action} purchase intent.`);
      }

      const updated = (await response.json()) as PurchaseIntent;
      setData((current) => ({
        ...current,
        purchaseIntents: current.purchaseIntents.map((item) => (item.id === updated.id ? updated : item)),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function disconnectAccount() {
    setBusy(true);
    try {
      await fetch("/api/retailer-accounts/proshop/disconnect", { method: "POST" });
      setData((current) => ({
        ...current,
        account: current.account ? { ...current.account, status: "disconnected" } : null,
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Single-user deal radar</p>
          <h1>Retail monitoring with purchase discipline.</h1>
          <p className="hero-summary">
            Track hardware, demo inventory, auctions, and DUTZO bundles from one surface. Every raw event
            lands in the dashboard; Discord only gets the high-signal subset.
          </p>
        </div>
        <div className="hero-grid">
          <article className="metric-card">
            <span className="metric-label">Live watches</span>
            <strong>{summary.liveWatches}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-label">Hot events</span>
            <strong>{summary.hotDeals}</strong>
          </article>
          <article className="metric-card">
            <span className="metric-label">Needs approval</span>
            <strong>{summary.pending}</strong>
          </article>
        </div>
      </section>

      <section className="panel-grid">
        <article className="panel account-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Retailer account</p>
              <h2>Proshop session</h2>
            </div>
            <span className={`status-pill ${data.account?.status ?? "disconnected"}`}>
              {data.account?.status ?? "missing"}
            </span>
          </div>
          <p className="muted">
            Use the local Playwright helper to log in once, then POST the encrypted storage state to
            `/api/retailer-accounts/proshop/connect`.
          </p>
          <div className="account-meta">
            <span>Label: {data.account?.label ?? "No session stored"}</span>
            <span>Connected: {data.account?.connectedAt ? new Date(data.account.connectedAt).toLocaleString() : "Never"}</span>
            <span>Last verified: {data.account?.lastVerifiedAt ? new Date(data.account.lastVerifiedAt).toLocaleString() : "Unknown"}</span>
          </div>
          <div className="button-row">
            <button
              className="action-button"
              onClick={() => {
                startTransition(() => {
                  void refreshDashboard();
                });
              }}
              disabled={busy}
            >
              Refresh feed
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                startTransition(() => {
                  void disconnectAccount();
                });
              }}
              disabled={busy}
            >
              Disconnect
            </button>
          </div>
          {data.mode === "demo" ? <p className="inline-note">Dashboard is showing seeded demo data because no database is configured yet.</p> : null}
        </article>

        <article className="panel composer-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Create watch</p>
              <h2>Feed the monitor</h2>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Name
              <input
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Demo GPU sweep"
              />
            </label>
            <label>
              Input type
              <select
                value={draft.inputType}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, inputType: event.target.value as WatchSpec["inputType"] }))
                }
              >
                <option value="keyword">Keyword</option>
                <option value="product">Product URL</option>
                <option value="category">Category/feed URL</option>
                <option value="auction_feed">Auction feed</option>
                <option value="bundle_feed">Bundle feed</option>
              </select>
            </label>
            <label className="wide">
              Target
              <input
                value={draft.target}
                onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}
                placeholder="RTX 5080 / https://www.proshop.dk/Hardware"
              />
            </label>
            <label>
              Cadence (min)
              <input
                type="number"
                min={2}
                max={240}
                value={draft.cadenceMinutes}
                onChange={(event) => setDraft((current) => ({ ...current, cadenceMinutes: Number(event.target.value) }))}
              />
            </label>
            <label>
              Min deal score
              <input
                type="number"
                min={0}
                max={100}
                value={draft.minDealScore}
                onChange={(event) => setDraft((current) => ({ ...current, minDealScore: Number(event.target.value) }))}
              />
            </label>
            <label>
              Max price
              <input
                value={draft.maxPrice}
                onChange={(event) => setDraft((current) => ({ ...current, maxPrice: event.target.value }))}
                placeholder="6999"
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.pushToDiscord}
                onChange={(event) => setDraft((current) => ({ ...current, pushToDiscord: event.target.checked }))}
              />
              Push qualified events to Discord
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.autoCreatePurchaseIntent}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, autoCreatePurchaseIntent: event.target.checked }))
                }
              />
              Auto-create pending purchase intent
            </label>
          </div>
          <button
            className="action-button full-width"
            onClick={() => {
              startTransition(() => {
                void submitWatch();
              });
            }}
            disabled={busy}
          >
            Save watch
          </button>
        </article>
      </section>

      <section className="panel-grid lower-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Manual approval queue</p>
              <h2>Purchase intents</h2>
            </div>
          </div>
          <div className="intent-stack">
            {data.purchaseIntents.length === 0 ? <p className="muted">No purchase intents yet.</p> : null}
            {data.purchaseIntents.map((intent) => (
              <div key={intent.id} className="intent-card">
                <div>
                  <strong>{intent.listingTitle}</strong>
                  <p>{intent.reason}</p>
                </div>
                <span className={`status-pill ${intent.status}`}>{intent.status}</span>
                <div className="button-row">
                  <a className="ghost-link" href={intent.listingUrl} target="_blank" rel="noreferrer">
                    Open listing
                  </a>
                  {intent.status === "pending_approval" ? (
                    <>
                      <button
                        className="action-button"
                        onClick={() => {
                          startTransition(() => {
                            void updateIntent(intent, "approve");
                          });
                        }}
                        disabled={busy}
                      >
                        Approve
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => {
                          startTransition(() => {
                            void updateIntent(intent, "reject");
                          });
                        }}
                        disabled={busy}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel event-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Everything feed</p>
              <h2>Normalized events</h2>
            </div>
            <input
              className="event-search"
              placeholder="Filter events"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="event-stack">
            {filteredEvents.map((event) => (
              <div key={event.id} className="event-card">
                <div className="event-meta">
                  <span className={`event-chip ${event.type}`}>{eventLabel(event.type)}</span>
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                </div>
                <strong>{event.listing.title}</strong>
                <p className="muted">
                  {formatPrice(event.listing.effectivePrice ?? event.listing.price)} · score{" "}
                  {event.listing.dealScore?.overall ?? 0} · {event.listing.availability}
                </p>
                <p>{event.listing.dealScore?.reasons.join(" ")}</p>
                <a className="ghost-link" href={event.listing.url} target="_blank" rel="noreferrer">
                  Open listing
                </a>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
