import type {
  PurchaseIntent,
  RetailerAccount,
} from "../domain.js";
import type { PurchasePreparationResult } from "../adapter.js";
import { decryptJson } from "../security.js";
import type { BrowserContext } from "playwright";

export async function prepareProshopPurchase(
  intent: PurchaseIntent,
  account: RetailerAccount,
): Promise<PurchasePreparationResult> {
  if (!account.encryptedSessionState) {
    return {
      intentId: intent.id,
      status: "blocked",
      liveSubmitted: false,
      notes: ["No stored Proshop session is available for purchase preparation."],
    };
  }

  if (intent.payload["sourceType"] === "auction") {
    return {
      intentId: intent.id,
      status: "blocked",
      liveSubmitted: false,
      notes: ["Auction bidding is intentionally disabled in v1."],
    };
  }

  const sessionSecret = process.env.SESSION_ENCRYPTION_KEY;
  if (!sessionSecret) {
    throw new Error("SESSION_ENCRYPTION_KEY is required for purchase preparation.");
  }

  const storageState = decryptJson<Awaited<ReturnType<BrowserContext["storageState"]>>>(
    account.encryptedSessionState,
    sessionSecret,
  );
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  const liveSubmissionAllowed =
    intent.liveSubmissionAllowed && process.env.ALLOW_LIVE_ORDER_SUBMIT === "true";
  const notes: string[] = [];

  try {
    await page.goto(intent.listingUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /kurv|add to cart|køb/i }).first().click();
    notes.push("Added listing to cart.");

    await page.goto("https://www.proshop.dk/kurv", { waitUntil: "networkidle" });
    const pickupStoreName = process.env.PROSHOP_PICKUP_STORE_NAME ?? "Proshop København";
    const pickupLabel = page.getByText(pickupStoreName, { exact: false }).first();
    if (await pickupLabel.isVisible().catch(() => false)) {
      await pickupLabel.click();
      notes.push(`Selected pickup store: ${pickupStoreName}.`);
    }

    const payInShopOption = page.getByText(/pay in shop|betal i butik|betal ved afhentning/i).first();
    if (await payInShopOption.isVisible().catch(() => false)) {
      await payInShopOption.click();
      notes.push("Selected pay-in-shop checkout.");
    }

    const placeOrderButton = page.getByRole("button", { name: /place order|afgiv ordre|bestil/i }).first();
    if (liveSubmissionAllowed) {
      await placeOrderButton.click();
      notes.push("Submitted live order because ALLOW_LIVE_ORDER_SUBMIT is enabled.");
      return {
        intentId: intent.id,
        status: "submitted",
        liveSubmitted: true,
        confirmationUrl: page.url(),
        notes,
      };
    }

    notes.push("Stopped before final order submission because live submit is disabled.");
    return {
      intentId: intent.id,
      status: "prepared",
      liveSubmitted: false,
      confirmationUrl: page.url(),
      notes,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
