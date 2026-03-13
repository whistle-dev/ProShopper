import type { EffectivePriceResult } from "../adapter.js";
import type { NormalizedListing, RetailerAccount } from "../domain.js";

export async function verifyProshopDemoEffectivePrice(
  listing: NormalizedListing,
  _account?: RetailerAccount | null,
): Promise<EffectivePriceResult> {
  if (!listing.badges.some((badge) => badge.toLowerCase().includes("demo"))) {
    return {
      effectivePrice: listing.price ?? null,
      observedAt: new Date().toISOString(),
      method: "page",
      notes: ["Listing does not carry a demo badge, so page price is treated as effective price."],
    };
  }

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const notes: string[] = [];

  try {
    await page.goto(listing.url, { waitUntil: "domcontentloaded" });
    const addToCartButton = page.getByRole("button", { name: /kurv|add to cart|køb/i }).first();
    await addToCartButton.click();
    await page.waitForLoadState("networkidle");
    await page.goto("https://www.proshop.dk/kurv", { waitUntil: "networkidle" });
    const priceText =
      (await page.locator("[data-testid='cart-total'], .cart-total, .order-total, .summary-total").first().textContent()) ??
      "";
    const match = priceText.replace(/\s+/g, " ").match(/([0-9]+(?:[.,][0-9]{1,2})?)/);
    const effectivePrice = match ? Number.parseFloat(match[1]!.replace(",", ".")) : listing.price ?? null;
    notes.push("Verified demo effective price using an isolated cart session.");

    return {
      effectivePrice,
      observedAt: new Date().toISOString(),
      method: "cart",
      notes,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}
